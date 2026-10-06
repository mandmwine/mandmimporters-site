// Asset upload + listing API.
// POST /api/assets  — multipart upload of an image, creates assets row,
//                     optionally links to a wine (bottle) or location (map).
// GET  /api/assets  — list assets with filters (?kind=bottle, ?wine_vintage_id=…).
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { storageConfigured, uploadBytes } from "@/lib/storage";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = ["bottle", "map", "logo", "photo", "document", "pdf", "other"] as const;
type Kind = (typeof KINDS)[number];
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/avif") return "avif";
  if (m === "image/svg+xml") return "svg";
  if (m === "application/pdf") return "pdf";
  return "bin";
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!storageConfigured()) {
    return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "bottle") as Kind;
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: `Unknown asset kind: ${kind}` }, { status: 400 });
  }
  const wineVintageId = String(form.get("wine_vintage_id") ?? "").trim() || null;
  const setAsBottle = form.get("set_as_bottle") === "on" || form.get("set_as_bottle") === "true";

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

  // Deduplicate: if we've seen this exact file before, re-use the asset row.
  const existing = await one<{ id: string; storage_path: string; mime_type: string | null }>(
    "SELECT id, storage_path, mime_type FROM assets WHERE checksum_sha256 = $1 AND deleted_at IS NULL",
    [checksum],
  );
  let assetId: string;
  if (existing) {
    assetId = existing.id;
  } else {
    const id = crypto.randomUUID();
    const ext = extForMime(file.type);
    const storagePath = `assets/originals/${id}.${ext}`;
    await uploadBytes({
      storagePath,
      bytes,
      contentType: file.type || "application/octet-stream",
      metadata: {
        uploadedBy: user.id,
        originalName: file.name.slice(0, 240),
      },
    });
    // Image dimensions: we don't have sharp in the base bundle; the client can
    // post width/height as hidden fields when it precomputed them, otherwise
    // we leave them null and show a warning on the asset.
    const widthRaw = form.get("width");
    const heightRaw = form.get("height");
    const width = typeof widthRaw === "string" ? parseInt(widthRaw, 10) : NaN;
    const height = typeof heightRaw === "string" ? parseInt(heightRaw, 10) : NaN;

    const row = await one<{ id: string }>(
      `INSERT INTO assets (
         id, kind, derivative, storage_path, file_name, mime_type,
         width_px, height_px, bytes, checksum_sha256, uploaded_by)
       VALUES ($1, $2, 'original', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        id, kind, storagePath, file.name.slice(0, 240), file.type || null,
        Number.isFinite(width) ? width : null,
        Number.isFinite(height) ? height : null,
        bytes.byteLength, checksum, user.id,
      ],
    );
    assetId = row!.id;
    await audit(user.id, "asset.upload", { type: "asset", id: assetId }, { new: { kind, bytes: bytes.byteLength } });
  }

  // Optional link: attach the asset to a wine vintage and (if requested) make
  // it the primary bottle image for the sheet.
  if (wineVintageId && /^[0-9a-f-]{36}$/i.test(wineVintageId)) {
    await query(
      `INSERT INTO wine_assets (wine_vintage_id, asset_id, role)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [wineVintageId, assetId, kind === "bottle" ? "bottle" : kind],
    );
    if (setAsBottle && kind === "bottle") {
      await query("UPDATE wine_vintages SET bottle_asset_id = $2 WHERE id = $1", [wineVintageId, assetId]);
      await audit(user.id, "wine_vintage.bottle_asset", { type: "wine_vintage", id: wineVintageId, field: "bottle_asset_id" }, { new: assetId });
    }
  }
  return NextResponse.json({ ok: true, id: assetId });
}

type AssetRow = {
  id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  bytes: number;
  created_at: Date;
};

export async function GET(req: NextRequest) {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const wineVintageId = sp.get("wine_vintage_id");

  const where: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  if (kind) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (wineVintageId && /^[0-9a-f-]{36}$/i.test(wineVintageId)) {
    params.push(wineVintageId);
    where.push(`id IN (SELECT asset_id FROM wine_assets WHERE wine_vintage_id = $${params.length})`);
  }

  const rows = await query<AssetRow>(
    `SELECT id, kind, file_name, mime_type, width_px, height_px, bytes, created_at
     FROM assets WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC LIMIT 200`,
    params,
  );
  return NextResponse.json({ assets: rows });
}
