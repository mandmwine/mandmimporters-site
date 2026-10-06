// Replace the bytes behind an existing asset.  The asset ID is kept so every
// wine that already references this asset keeps working.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { storageConfigured, uploadBytes } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!storageConfigured()) {
    return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await one<{ id: string }>("SELECT id FROM assets WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const ext = extForMime(file.type);
  const storagePath = `assets/originals/${id}.${ext}`;
  await uploadBytes({
    storagePath,
    bytes,
    contentType: file.type || "application/octet-stream",
    metadata: {
      uploadedBy: user.id,
      originalName: file.name.slice(0, 240),
      replaced: "true",
    },
  });

  const widthRaw = form.get("width");
  const heightRaw = form.get("height");
  const width = typeof widthRaw === "string" ? parseInt(widthRaw, 10) : NaN;
  const height = typeof heightRaw === "string" ? parseInt(heightRaw, 10) : NaN;

  await query(
    `UPDATE assets SET storage_path = $2, file_name = $3, mime_type = $4,
       width_px = $5, height_px = $6, bytes = $7, checksum_sha256 = $8
     WHERE id = $1`,
    [
      id, storagePath, file.name.slice(0, 240), file.type || null,
      Number.isFinite(width) ? width : null,
      Number.isFinite(height) ? height : null,
      bytes.byteLength, checksum,
    ],
  );
  await audit(user.id, "asset.replace", { type: "asset", id }, { new: { bytes: bytes.byteLength, checksum } });
  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
  return NextResponse.json({ ok: true, id });
}
