// Shared data loader for the single-wine sheet renderer and the PDF exporter.
// Returns everything the Template 05 layout needs in one shot.
import { one, query } from "@/lib/db";

export type SheetData = {
  wine: {
    id: string;
    vintage_text: string | null;
    display_name: string;
    canonical_name: string;
    producer: string;
    category: string | null;
    tasting_note: string | null;
    food_pairing: string | null;
    special_designation: string | null;
    supervision_display: string | null;
    mevushal: "yes" | "no" | "unknown";
    bottle_sizes: string[];
    aging_display: string | null;
    first_kosher_vintage: boolean | null;
    organic: boolean | null;
    biodynamic: boolean | null;
    website_slug: string | null;
    short_description: string | null;
  };
  producer_note: string | null;
  location: {
    country: string | null;
    region: string | null;
    subregion: string | null;
    appellation: string | null;
  };
  grapes: { name: string; percentage: string | null }[];
  scores: { critic: string | null; short_label: string | null; score_text: string; award_text: string | null; quote: string | null; vintage_text: string | null; current_vintage: boolean }[];
  bottle_image_url: string | null;
};

type VintageRow = {
  id: string;
  wine_id: string;
  vintage_text: string | null;
  tasting_note: string | null;
  food_pairing: string | null;
  special_designation: string | null;
  supervision_display: string | null;
  mevushal: "yes" | "no" | "unknown";
  bottle_sizes: string[];
  aging_display: string | null;
  first_kosher_vintage: boolean | null;
  organic: boolean | null;
  biodynamic: boolean | null;
  short_description: string | null;
  location_id: string | null;
  display_name: string;
  canonical_name: string;
  producer: string;
  producer_id: string;
  category: string | null;
  website_slug: string | null;
  producer_note: string | null;
  legacy: Record<string, unknown>;
};

export async function loadSheetData(vintageId: string): Promise<SheetData | null> {
  const v = await one<VintageRow>(
    `SELECT v.id, v.wine_id, v.vintage_text, v.tasting_note, v.food_pairing, v.special_designation,
            v.supervision_display, v.mevushal, v.bottle_sizes, v.aging_display,
            v.first_kosher_vintage, v.organic, v.biodynamic, v.short_description, v.location_id,
            v.legacy,
            w.display_name, w.canonical_name, w.category, w.website_slug,
            p.id AS producer_id, p.name AS producer, p.winery_summary_short AS producer_note
     FROM wine_vintages v
     JOIN wines w ON w.id = v.wine_id
     JOIN producers p ON p.id = w.producer_id
     WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [vintageId],
  );
  if (!v) return null;

  const [chain, grapes, currentScores, otherScores] = await Promise.all([
    query<{ type: string; name: string }>(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id, type, name, 0 AS depth FROM locations WHERE id = $1
         UNION ALL SELECT x.id, x.parent_id, x.type, x.name, up.depth + 1
         FROM locations x JOIN up ON x.id = up.parent_id)
       SELECT type, name FROM up ORDER BY depth DESC`,
      [v.location_id],
    ),
    query<{ name: string; percentage: string | null }>(
      `SELECT g.canonical_name AS name, wg.percentage
       FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
       WHERE wg.wine_vintage_id = $1 ORDER BY wg.display_order`,
      [v.id],
    ),
    query<{ critic: string | null; short_label: string | null; score_text: string; award_text: string | null; quote: string | null; numeric_score: string | null; vintage_text: string | null; raw_text: string | null }>(
      `SELECT c.canonical_name AS critic, c.short_label, s.score_text, s.award_text,
              s.numeric_score, s.raw_text AS quote, v.vintage_text
       FROM wine_scores s LEFT JOIN critics c ON c.id = s.critic_id
       JOIN wine_vintages v ON v.id = s.wine_vintage_id
       WHERE s.wine_vintage_id = $1 AND s.is_primary
       ORDER BY s.numeric_score DESC NULLS LAST, s.display_order
       LIMIT 4`,
      [v.id],
    ),
    // Older vintages' scores, ≥ 90 only, as per the owner's rule (shown as secondary).
    query<{ critic: string | null; short_label: string | null; score_text: string; award_text: string | null; quote: string | null; numeric_score: string | null; vintage_text: string | null }>(
      `SELECT c.canonical_name AS critic, c.short_label, s.score_text, s.award_text,
              s.numeric_score, s.raw_text AS quote, vv.vintage_text
       FROM wine_scores s JOIN wine_vintages vv ON vv.id = s.wine_vintage_id
       LEFT JOIN critics c ON c.id = s.critic_id
       WHERE vv.wine_id = $1 AND vv.id <> $2 AND s.numeric_score >= 90
       ORDER BY vv.vintage_text DESC NULLS LAST, s.numeric_score DESC NULLS LAST
       LIMIT 4`,
      [v.wine_id, v.id],
    ),
  ]);

  const loc = (t: string) => chain.find((c) => c.type === t)?.name ?? null;

  // Barrel samples are only shown if nothing better exists for this vintage.
  const nonBarrelCurrent = currentScores.filter((s) => !/barrel/i.test(s.quote ?? ""));
  const effectiveCurrent = nonBarrelCurrent.length > 0 ? nonBarrelCurrent : currentScores;
  const needed = Math.max(0, 4 - effectiveCurrent.length);
  const extraOlder = needed > 0 ? otherScores.slice(0, needed) : [];
  const scores = [
    ...effectiveCurrent.map((s) => ({ ...s, current_vintage: true })),
    ...extraOlder.map((s) => ({ ...s, current_vintage: false })),
  ];

  // Fall back to the public website bottle image when nothing else is set.
  const bottle_image_url = v.website_slug
    ? `https://www.mandmimporters.com/images/images/${v.website_slug}.jpg`
    : null;

  return {
    wine: {
      id: v.id,
      vintage_text: v.vintage_text,
      display_name: v.display_name,
      canonical_name: v.canonical_name,
      producer: v.producer,
      category: v.category,
      tasting_note: v.tasting_note,
      food_pairing: v.food_pairing,
      special_designation: v.special_designation,
      supervision_display: v.supervision_display,
      mevushal: v.mevushal,
      bottle_sizes: v.bottle_sizes,
      aging_display: v.aging_display,
      first_kosher_vintage: v.first_kosher_vintage,
      organic: v.organic,
      biodynamic: v.biodynamic,
      website_slug: v.website_slug,
      short_description: v.short_description,
    },
    producer_note: v.producer_note,
    location: {
      country: loc("country"),
      region: loc("region"),
      subregion: loc("subregion"),
      appellation: loc("appellation"),
    },
    grapes,
    scores,
    bottle_image_url,
  };
}
