import Link from "next/link";
import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";
import VintageCompare, { type CompareVintage } from "@/components/VintageCompare";
import { signedUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

type VintageRow = {
  id: string;
  wine_id: string;
  vintage_text: string | null;
  status: string;
  mevushal: "yes" | "no" | "unknown";
  supervision_display: string | null;
  aging_display: string | null;
  bottle_sizes: string[];
  special_designation: string | null;
  tasting_note: string | null;
  food_pairing: string | null;
  short_description: string | null;
  first_kosher_vintage: boolean | null;
  organic: boolean | null;
  biodynamic: boolean | null;
  bottle_asset_id: string | null;
  bottle_asset_path: string | null;
  legacy_img: string | null;
  grapes_text: string;
  score_count: number;
  top_score: string | null;
  updated_at: Date;
};

export default async function CompareVintagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const current = await one<{ wine_id: string; display_name: string; producer: string }>(
    `SELECT v.wine_id, w.display_name, p.name AS producer
       FROM wine_vintages v JOIN wines w ON w.id = v.wine_id JOIN producers p ON p.id = w.producer_id
       WHERE v.id = $1`,
    [id],
  );
  if (!current) notFound();

  const rows = await query<VintageRow>(
    `SELECT v.id, v.wine_id, v.vintage_text, v.status, v.mevushal,
            v.supervision_display, v.aging_display, v.bottle_sizes,
            v.special_designation, v.tasting_note, v.food_pairing, v.short_description,
            v.first_kosher_vintage, v.organic, v.biodynamic, v.bottle_asset_id, v.updated_at,
            a.storage_path AS bottle_asset_path,
            v.legacy->>'img' AS legacy_img,
       COALESCE(
         (SELECT string_agg(
           CASE WHEN wg.percentage IS NOT NULL
                THEN wg.percentage::text || '% ' || g.canonical_name
                ELSE g.canonical_name END,
           ', ' ORDER BY wg.display_order)
          FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
          WHERE wg.wine_vintage_id = v.id), '') AS grapes_text,
       (SELECT count(*)::int FROM wine_scores WHERE wine_vintage_id = v.id) AS score_count,
       (SELECT score_text FROM wine_scores WHERE wine_vintage_id = v.id AND is_primary
          ORDER BY numeric_score DESC NULLS LAST LIMIT 1) AS top_score
       FROM wine_vintages v
       LEFT JOIN assets a ON a.id = v.bottle_asset_id AND a.deleted_at IS NULL
       WHERE v.wine_id = $1 AND v.deleted_at IS NULL
       ORDER BY v.vintage_text DESC NULLS LAST`,
    [current.wine_id],
  );

  // Resolve bottle thumbnails: signed URL for an uploaded asset, else the
  // legacy site image. Parallelised with a cap to keep Firebase happy.
  const CONCURRENCY = 10;
  const thumbByVintage = new Map<string, string | null>();
  const assetRows = rows.filter((r) => r.bottle_asset_path);
  for (let i = 0; i < assetRows.length; i += CONCURRENCY) {
    const chunk = assetRows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (r) => {
        try {
          const url = await signedUrl(r.bottle_asset_path as string, 60);
          return [r.id, url] as const;
        } catch (err) {
          console.warn("[compare] signedUrl failed", r.id, err);
          return [r.id, null] as const;
        }
      }),
    );
    for (const [vid, url] of results) thumbByVintage.set(vid, url);
  }

  const vintages: CompareVintage[] = rows.map((r) => {
    let thumb = thumbByVintage.get(r.id) ?? null;
    if (!thumb && r.legacy_img) {
      thumb = r.legacy_img.startsWith("http")
        ? r.legacy_img
        : `https://www.mandmimporters.com${r.legacy_img}`;
    }
    return {
      id: r.id,
      vintage_text: r.vintage_text,
      status: r.status,
      mevushal: r.mevushal,
      supervision_display: r.supervision_display,
      aging_display: r.aging_display,
      bottle_sizes: r.bottle_sizes,
      special_designation: r.special_designation,
      tasting_note: r.tasting_note,
      food_pairing: r.food_pairing,
      short_description: r.short_description,
      first_kosher_vintage: r.first_kosher_vintage,
      organic: r.organic,
      biodynamic: r.biodynamic,
      bottle_asset_id: r.bottle_asset_id,
      bottle_thumb_url: thumb,
      grapes_text: r.grapes_text,
      score_count: r.score_count,
      top_score: r.top_score,
      updated_at: r.updated_at.toISOString(),
    };
  });

  return (
    <>
      <nav className="crumbs">
        <Link href={`/wines/${id}`}>← Back to this vintage</Link>
      </nav>
      <header className="page-head">
        <p className="eyebrow">{current.producer}</p>
        <h1>{current.display_name} · vintage comparison</h1>
        <p className="muted">{vintages.length} vintage{vintages.length === 1 ? "" : "s"} on record</p>
      </header>

      <VintageCompare currentId={id} vintages={vintages} />
    </>
  );
}
