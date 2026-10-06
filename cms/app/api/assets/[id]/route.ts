// Serve an asset by signed URL. The browser hits this endpoint, we check the
// user is logged in, then 302 to a short-lived Firebase Storage signed URL so
// the actual bytes come from Firebase and don't pass through the lambda.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await one<{ storage_path: string; mime_type: string | null; deleted_at: Date | null }>(
    "SELECT storage_path, mime_type, deleted_at FROM assets WHERE id = $1",
    [id],
  );
  if (!asset || asset.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const url = await signedUrl(asset.storage_path, 60);
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error("[asset] signed-url failed", id, err);
    return NextResponse.json({ error: "Image unavailable" }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await one<{ storage_path: string }>(
    "SELECT storage_path FROM assets WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete; the storage object is retained for the moment so recent
  // exports can still link to it. A later cleanup job removes orphans.
  const { query } = await import("@/lib/db");
  const { audit } = await import("@/lib/audit");
  await query("UPDATE assets SET deleted_at = now() WHERE id = $1", [id]);
  // Any wine that still points at this asset gets cleared so the renderer
  // falls back to the website image rather than showing broken bottles.
  await query("UPDATE wine_vintages SET bottle_asset_id = NULL WHERE bottle_asset_id = $1", [id]);
  await audit(user.id, "asset.delete", { type: "asset", id });
  return NextResponse.json({ ok: true });
}
