// Lightweight quick-search for the command palette.  Returns a merged list of
// matching wines (latest vintage) and producers, up to 12 hits total.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WineHit = { id: string; vintage_id: string; label: string; sub: string; kind: "wine" };
type ProducerHit = { id: string; vintage_id: string; label: string; sub: string; kind: "producer" };
type Hit = WineHit | ProducerHit;

export async function GET(req: NextRequest) {
  await requireUser();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${q}%`;

  const [wines, producers] = await Promise.all([
    query<WineHit>(
      `SELECT w.id, v.id AS vintage_id,
              (w.display_name || CASE WHEN v.vintage_text IS NOT NULL
                                      THEN ' ' || v.vintage_text ELSE '' END) AS label,
              (p.name || CASE WHEN l.name IS NOT NULL THEN ' · ' || l.name ELSE '' END) AS sub,
              'wine'::text AS kind
         FROM wines w
         JOIN wine_vintages v ON v.wine_id = w.id AND v.deleted_at IS NULL
         JOIN producers p ON p.id = w.producer_id
         LEFT JOIN locations l ON l.id = v.location_id
         WHERE w.deleted_at IS NULL
           AND (w.display_name ILIKE $1 OR p.name ILIKE $1 OR coalesce(l.name,'') ILIKE $1
                OR coalesce(v.vintage_text, '') ILIKE $1)
         ORDER BY w.display_name, v.vintage_text DESC NULLS LAST
         LIMIT 8`,
      [like],
    ),
    query<ProducerHit>(
      `SELECT p.id, p.id AS vintage_id, p.name AS label,
              coalesce(l.name, '') AS sub, 'producer'::text AS kind
         FROM producers p
         LEFT JOIN locations l ON l.id = p.country_location_id
         WHERE p.deleted_at IS NULL AND p.name ILIKE $1
         ORDER BY p.name
         LIMIT 4`,
      [like],
    ),
  ]);

  return NextResponse.json({ hits: [...wines, ...producers] });
}
