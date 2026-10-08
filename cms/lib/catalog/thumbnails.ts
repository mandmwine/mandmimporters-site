// Phase 25 — Catalog thumbnail preview strip (audit §29 step 4).
//
// Pulls every item in a catalog, grouped by section, and resolves a bottle
// thumbnail URL per wine (signed Firebase URL for uploaded assets, else the
// legacy site image, else null → placeholder). This is a *lightweight* view
// of the final catalog composition, meant to be scanned in one glance before
// clicking Export.
import "server-only";
import { query } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export type ThumbItem = {
  id: string;
  position: number;
  wine_vintage_id: string;
  wine_name: string;
  producer: string;
  vintage_text: string | null;
  thumb_url: string | null;
  has_bottle: boolean;
  flag_count: number;
};

export type ThumbSection = {
  id: string | null; // null = items not assigned to any section
  kind: string;
  title: string | null;
  position: number;
  items: ThumbItem[];
};

type ItemRow = {
  id: string;
  position: number;
  section_id: string | null;
  wine_vintage_id: string;
  wine_name: string;
  producer: string;
  vintage_text: string | null;
  bottle_asset_path: string | null;
  legacy_img: string | null;
  flag_count: number;
};

type SectionRow = {
  id: string;
  kind: string;
  title: string | null;
  position: number;
};

const KIND_LABEL: Record<string, string> = {
  cover: "Cover",
  intro: "M&M Intro",
  toc: "Table of Contents",
  regional_index: "Regional Index",
  divider: "Section Divider",
  producer_intro: "Producer Intro",
  wines: "Wines",
  producer_index: "Producer Index",
  contact: "Contact",
  back_cover: "Back Cover",
};

export function sectionLabel(kind: string, title: string | null): string {
  if (title && title.trim()) return title.trim();
  return KIND_LABEL[kind] ?? kind;
}

export function sectionKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export async function loadCatalogThumbnails(catalogId: string): Promise<ThumbSection[]> {
  const [sections, items] = await Promise.all([
    query<SectionRow>(
      "SELECT id, kind, title, position FROM catalog_sections WHERE catalog_id = $1 ORDER BY position",
      [catalogId],
    ),
    query<ItemRow>(
      `SELECT ci.id, ci.position, ci.section_id, ci.wine_vintage_id,
              w.display_name AS wine_name, p.name AS producer, v.vintage_text,
              a.storage_path AS bottle_asset_path,
              v.legacy->>'img' AS legacy_img,
              (SELECT count(*)::int FROM review_flags f
                 WHERE f.entity_type = 'wine_vintage' AND f.entity_id = v.id AND f.status = 'open') AS flag_count
       FROM catalog_items ci
       JOIN wine_vintages v ON v.id = ci.wine_vintage_id
       JOIN wines w ON w.id = v.wine_id
       JOIN producers p ON p.id = w.producer_id
       LEFT JOIN assets a ON a.id = v.bottle_asset_id AND a.deleted_at IS NULL
       WHERE ci.catalog_id = $1
       ORDER BY ci.position`,
      [catalogId],
    ),
  ]);

  // Resolve signed URLs in parallel, but cap concurrency to avoid Firebase
  // hammering on very large catalogs. 10 at a time is comfortably within
  // Firebase's per-second limits for signed-URL generation.
  const CONCURRENCY = 10;
  const resolved = new Map<string, string | null>();
  const assetItems = items.filter((it) => it.bottle_asset_path);
  for (let i = 0; i < assetItems.length; i += CONCURRENCY) {
    const chunk = assetItems.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (it) => {
        try {
          const url = await signedUrl(it.bottle_asset_path as string, 60);
          return [it.id, url] as const;
        } catch (err) {
          console.warn("[thumbnails] signedUrl failed for", it.id, err);
          return [it.id, null] as const;
        }
      }),
    );
    for (const [id, url] of results) resolved.set(id, url);
  }

  // Compose per-item thumb data.
  const thumbItems: ThumbItem[] = items.map((it) => {
    let thumb_url: string | null = resolved.get(it.id) ?? null;
    if (!thumb_url && it.legacy_img) {
      thumb_url = it.legacy_img.startsWith("http")
        ? it.legacy_img
        : `https://www.mandmimporters.com${it.legacy_img}`;
    }
    return {
      id: it.id,
      position: it.position,
      wine_vintage_id: it.wine_vintage_id,
      wine_name: it.wine_name,
      producer: it.producer,
      vintage_text: it.vintage_text,
      thumb_url,
      has_bottle: Boolean(it.bottle_asset_path || it.legacy_img),
      flag_count: it.flag_count,
    };
  });

  // Group items by section, preserving section order from the sections table.
  // Items without a section (section_id = null) go into a synthetic trailing
  // "Unassigned" group only if any exist.
  const grouped: ThumbSection[] = sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    position: s.position,
    items: thumbItems.filter((it) => {
      const row = items.find((r) => r.id === it.id);
      return row?.section_id === s.id;
    }),
  }));
  const unassigned = thumbItems.filter((it) => {
    const row = items.find((r) => r.id === it.id);
    return row?.section_id === null;
  });
  if (unassigned.length > 0) {
    grouped.push({
      id: null,
      kind: "wines",
      title: "Unassigned",
      position: 9999,
      items: unassigned,
    });
  }
  return grouped;
}
