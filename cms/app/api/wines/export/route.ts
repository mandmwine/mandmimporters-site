// CSV export of a list of wine vintages. Called by the Selection Bar's
// "Export CSV" button; the client sends ?ids=uuid,uuid,uuid. Also supports
// "all current filters" exports via no-ids (TODO) but for now we export only
// what's selected.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  producer: string;
  display_name: string;
  vintage_text: string | null;
  category: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  mevushal: string;
  supervision_display: string | null;
  aging_display: string | null;
  tasting_note: string | null;
  food_pairing: string | null;
  bottle_sizes: string[];
  status: string;
  grapes: string | null;
  top_score: string | null;
  updated_at: Date;
};

// RFC 4180: quote cells with ",, "\"\\n", wrap in quotes, double any internal quotes.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Allowed filter inputs mirror /wines page. `all=1` means "every vintage
// matching these filters" — ids are ignored in that case.
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
  const all = sp.get("all") === "1";

  // Build the id list. Either (a) explicit ids from the Selection Bar, or
  // (b) the complete filtered set when the caller said "export all".
  let whereIds: string[] | null = null;
  let whereFilters: { sql: string; params: unknown[] } | null = null;

  if (all) {
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
    whereFilters = { sql: where.join(" AND "), params };
  } else {
    const idsCsv = sp.get("ids") ?? "";
    whereIds = idsCsv.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    if (whereIds.length === 0) {
      return NextResponse.json({ error: "No wine ids given — pass ?ids=... or ?all=1 with filters." }, { status: 400 });
    }
  }

  const baseFrom = `FROM wine_vintages v
       JOIN wines w ON w.id = v.wine_id
       JOIN producers p ON p.id = w.producer_id
       LEFT JOIN LATERAL (
         WITH RECURSIVE up AS (
           SELECT id, parent_id, type, name FROM locations WHERE id = v.location_id
           UNION ALL SELECT x.id, x.parent_id, x.type, x.name FROM locations x JOIN up ON x.id = up.parent_id
         ) SELECT name FROM up WHERE type = 'country' LIMIT 1
       ) country ON true
       LEFT JOIN LATERAL (
         WITH RECURSIVE up AS (
           SELECT id, parent_id, type, name FROM locations WHERE id = v.location_id
           UNION ALL SELECT x.id, x.parent_id, x.type, x.name FROM locations x JOIN up ON x.id = up.parent_id
         ) SELECT name FROM up WHERE type = 'region' LIMIT 1
       ) region ON true
       LEFT JOIN LATERAL (
         WITH RECURSIVE up AS (
           SELECT id, parent_id, type, name FROM locations WHERE id = v.location_id
           UNION ALL SELECT x.id, x.parent_id, x.type, x.name FROM locations x JOIN up ON x.id = up.parent_id
         ) SELECT name FROM up WHERE type = 'appellation' LIMIT 1
       ) appellation ON true`;
  const selectCols = `p.name AS producer, w.display_name, v.vintage_text, w.category,
            country.name AS country, region.name AS region, appellation.name AS appellation,
            v.mevushal, v.supervision_display, v.aging_display,
            v.tasting_note, v.food_pairing, v.bottle_sizes, v.status, v.updated_at,
            (SELECT string_agg(
               CASE WHEN wg.percentage IS NOT NULL THEN wg.percentage::text || '% ' || g.canonical_name
                    ELSE g.canonical_name END,
               '; ' ORDER BY wg.display_order)
               FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
               WHERE wg.wine_vintage_id = v.id) AS grapes,
            (SELECT s.score_text FROM wine_scores s
               WHERE s.wine_vintage_id = v.id AND s.is_primary
               ORDER BY s.numeric_score DESC NULLS LAST LIMIT 1) AS top_score`;

  let rows: Row[];
  if (all && whereFilters) {
    rows = await query<Row>(
      `SELECT ${selectCols} ${baseFrom}
       WHERE ${whereFilters.sql}
       ORDER BY p.name, w.display_name, v.vintage_text DESC NULLS LAST`,
      whereFilters.params,
    );
  } else {
    rows = await query<Row>(
      `SELECT ${selectCols} ${baseFrom}
       WHERE v.id = ANY($1::uuid[]) AND v.deleted_at IS NULL
       ORDER BY p.name, w.display_name, v.vintage_text DESC NULLS LAST`,
      [whereIds],
    );
  }

  const header = [
    "Producer", "Wine", "Vintage", "Category",
    "Country", "Region", "Appellation",
    "Mevushal", "Supervision", "Aging",
    "Grapes", "Top score",
    "Sizes", "Status", "Tasting note", "Food pairing",
    "Last updated",
  ];
  const lines: string[] = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.producer, r.display_name, r.vintage_text, r.category,
      r.country, r.region, r.appellation,
      r.mevushal, r.supervision_display, r.aging_display,
      r.grapes, r.top_score,
      r.bottle_sizes, r.status, r.tasting_note, r.food_pairing,
      new Date(r.updated_at).toISOString().slice(0, 10),
    ].map(csvCell).join(","));
  }
  // Add a UTF-8 BOM so Excel opens accented characters correctly.
  const body = "﻿" + lines.join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mandm-wines-${today}-${rows.length}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
