// Lineup layout: 2–6 bottles on one landscape-oriented portrait page.
// Producer-focused — all wines share one producer header and one region map.
// Each wine shows: bottle photo, name + vintage, appellation, one-line note,
// optional primary score.
import type { SheetData } from "./data";
import { renderRegionMap } from "./region-map";

export type LineupData = {
  producer: string;
  producer_note?: string | null;
  wines: SheetData[]; // each pre-loaded via loadSheetData, 2–6 entries
  theme_tagline?: string;
  // Phase 44 — producer brand assets. Logo renders in place of the
  // eyebrow when present; hero renders as a top strip on Portfolio
  // pages only. Both are optional; falls back to the text header.
  producer_logo_url?: string | null;
  producer_hero_url?: string | null;
};

export function LineupPage({ data }: { data: LineupData }) {
  const wines = data.wines.slice(0, 6);
  const first = wines[0];
  const location = first?.location ?? { country: null, region: null, subregion: null, appellation: null };
  const map = renderRegionMap(
    {
      country: location.country,
      region: location.region,
      subregion: null,       // Lineup zooms out to the region, not the appellation
      appellation: null,
    },
    // Fall back to the single-wine map if a region-level GeoJSON has been
    // approved for one of these wines; the renderer re-highlights the region.
    first?.geoMap ?? null,
    `${first?.wine.canonical_name ?? ""} ${first?.wine.special_designation ?? ""}`,
  );

  return (
    <article className="sheet sheet--print lineup" data-count={wines.length}>
      {/* Phase 44 — Portfolio-mode hero strip. Omitted on plain Lineup
          (the catalog-html dispatcher only passes producer_hero_url for
          'portfolio' pages). The hero sits above the main header and
          caps at a modest height so it doesn't eat the content column. */}
      {data.producer_hero_url && (
        <div className="lineup__hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.producer_hero_url} alt="" />
        </div>
      )}
      <header className="lineup__head">
        <div>
          {/* Phase 44 — a producer logo (when present) sits above the
              name in place of a plain uppercase eyebrow. Falls back to
              the country/region line below the name when the logo is
              missing so the geography still reads at a glance. */}
          {data.producer_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lineup__logo" src={data.producer_logo_url} alt={data.producer} />
          ) : (
            <p className="lineup__eyebrow">
              {location.country?.toUpperCase() ?? ""}
              {location.region && (location.country ? ` · ${location.region.toUpperCase()}` : location.region.toUpperCase())}
            </p>
          )}
          <h1 className="lineup__producer">{data.producer}</h1>
          {data.producer_logo_url && (
            <p className="lineup__eyebrow lineup__eyebrow--sub">
              {location.country?.toUpperCase() ?? ""}
              {location.region && (location.country ? ` · ${location.region.toUpperCase()}` : location.region.toUpperCase())}
            </p>
          )}
          {data.theme_tagline && <p className="lineup__tagline">{data.theme_tagline}</p>}
          {data.producer_note && <p className="lineup__note">{data.producer_note}</p>}
        </div>
        <div className="lineup__map">{map}</div>
      </header>

      <div className={`lineup__grid lineup__grid--${wines.length}`}>
        {wines.map((w) => {
          const primary = w.scores[0];
          const grapes = w.grapes
            .map((g) => (g.percentage ? `${Math.round(Number(g.percentage))}% ${g.name}` : g.name))
            .join(", ");
          return (
            <figure className="lineup__wine" key={w.wine.id}>
              {w.bottle_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="lineup__bottle" src={w.bottle_image_url} alt={w.wine.display_name} />
              )}
              {primary && (
                <div className="lineup__score">
                  <span className="lineup__score-num">{primary.score_text}</span>
                  <span className="lineup__score-critic">{primary.short_label ?? primary.critic ?? ""}</span>
                </div>
              )}
              <figcaption>
                <p className="lineup__vintage">{w.wine.vintage_text ?? "NV"}</p>
                <h3 className="lineup__name">{stripProducer(w.wine.canonical_name, data.producer) || w.wine.display_name}</h3>
                <p className="lineup__appellation">
                  {[w.location.appellation, w.wine.special_designation].filter(Boolean).join(" ")}
                </p>
                {grapes && <p className="lineup__grapes">{grapes}</p>}
                {w.wine.short_description && <p className="lineup__one-liner">{w.wine.short_description}</p>}
              </figcaption>
            </figure>
          );
        })}
      </div>

      <footer className="lineup__foot">
        <div className="lineup__foot-rule" />
        <div className="lineup__foot-brand">
          <span className="sheet__brand-mark">M &amp; M IMPORTS</span>
          <span className="sheet__brand-sub">Fine Wines · Higher Conversations</span>
        </div>
        <div className="lineup__foot-rule" />
      </footer>
    </article>
  );
}

function stripProducer(name: string | null, producer: string): string {
  if (!name) return "";
  if (name.toLowerCase().startsWith(producer.toLowerCase() + " ")) {
    return name.slice(producer.length).trim();
  }
  return name;
}
