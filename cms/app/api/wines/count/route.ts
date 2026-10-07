// Count of wine_vintages matching a set of query-string filters. Used by the
// Selection Bar's export chooser so "Export all matching filters" can show
// exactly how many rows the export would include. Same filter semantics as
// /wines and the export route.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MISSING_SQL: Record<string, string> = {
  vintage: "v.vintage_text IS NULL",
  mevushal: "v.mevushal = 'unknown'",
  supervision: "coalesce(v.supervision_display, '') = ''",
  tasting: "coalesce(v.tasting_note, '') = ''",
  scores: "NOT EXISTS (SELECT 1 FROM wine_scores s WHERE s.wine_vintage_id = v.id)",
  bottle: "v.bottle_asset_id IS NULL",
};

export async function GET(req: NextRequest) {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const where: string[] = ["v.deleted_at IS NULL", "w.deleted_at IS NULL"];
  const params: unknown[] = [];
  const q = (sp.get("q") ?? "").trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(w.display_name) LIKE $${params.length} OR lower(p.name) LIKE $${params.length} OR lower(v.vintage_text) LIKE $${params.length})`);
  }
  const status = sp.get("status");
  if (status && ["draft", "needs_review", "approved", "published", "discontinued"].includes(status)) {
    params.push(status);
    where.push(`v.status = $${params.length}`);
  }
  const country = sp.get("country");
  if (country) {
    params.push(country);
    where.push(`EXISTS (
      WITH RECURSIVE up AS (
        SELECT id, parent_id, type, name FROM locations WHERE id = v.location_id
        UNION ALL SELECT x.id, x.parent_id, x.type, x.name FROM locations x JOIN up ON x.id = up.parent_id
      ) SELECT 1 FROM up WHERE type = 'country' AND lower(name) = lower($${params.length}))`);
  }
  for (const m of (sp.get("missing") ?? "").split(",").filter(Boolean)) {
    if (MISSING_SQL[m]) where.push(MISSING_SQL[m]);
  }
  const row = await one<{ n: number }>(
    `SELECT count(*)::int AS n
     FROM wine_vintages v JOIN wines w ON w.id = v.wine_id JOIN producers p ON p.id = w.producer_id
     WHERE ${where.join(" AND ")}`,
    params,
  );
  return NextResponse.json({ total: row?.n ?? 0 });
}
