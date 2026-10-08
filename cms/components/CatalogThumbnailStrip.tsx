// Phase 25 — Catalog thumbnail preview strip (audit §29 step 4).
//
// A full-width panel on the catalog detail page that shows the catalog's
// composition as a horizontal strip of mini-cards: one per structural
// section (cover, divider, intro…) and one per wine (bottle thumb + name).
// This is what makes the catalog *visible* before export — not a rendered
// PDF, but a scannable "here's what will be in it, in order" overview.
//
// Click a wine card → open the wine workspace (editor) for that wine.
// Structural sections render as labeled placeholder cards; they aren't
// clickable because they're composed in the Sections panel above.
import Link from "next/link";
import { loadCatalogThumbnails, sectionKindLabel } from "@/lib/catalog/thumbnails";

type Props = {
  catalogId: string;
};

export default async function CatalogThumbnailStrip({ catalogId }: Props) {
  const sections = await loadCatalogThumbnails(catalogId);
  const totalWines = sections.reduce((acc, s) => acc + s.items.length, 0);

  if (sections.length === 0 && totalWines === 0) {
    // Rendered only if there's something to preview; the empty-state
    // messaging lives in the Wines-in-this-catalog panel.
    return null;
  }

  return (
    <section className="panel thumb-strip">
      <div className="panel-head">
        <h2>Preview strip</h2>
        <p className="small muted">
          A quick visual pass of what&rsquo;s in this catalog, in order. Click any wine to open it.
        </p>
      </div>
      <div className="thumb-strip__scroll" role="list">
        {sections.map((s, sIdx) => (
          <div className="thumb-strip__group" key={s.id ?? `g-${sIdx}`} role="listitem">
            <div className="thumb-strip__group-label">
              <span className="thumb-strip__group-kind">{sectionKindLabel(s.kind)}</span>
              {s.title && <span className="thumb-strip__group-title">&middot; {s.title}</span>}
              {s.kind === "wines" && (
                <span className="thumb-strip__group-count small muted">
                  &middot; {s.items.length} wine{s.items.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="thumb-strip__row">
              {/* Structural placeholder card for the section itself, so the
                  user can see where a Cover / TOC / Divider sits in order. */}
              {s.kind !== "wines" && (
                <div className={`thumb-card thumb-card--structural thumb-card--${s.kind}`} aria-label={sectionKindLabel(s.kind)}>
                  <div className="thumb-card__structural-art" aria-hidden>
                    {structuralGlyph(s.kind)}
                  </div>
                  <div className="thumb-card__structural-label">
                    {sectionKindLabel(s.kind)}
                  </div>
                </div>
              )}
              {s.items.length === 0 && s.kind === "wines" && (
                <div className="thumb-strip__empty small muted">No wines in this section yet.</div>
              )}
              {s.items.map((it) => (
                <Link
                  key={it.id}
                  href={`/wines/${it.wine_vintage_id}`}
                  className={`thumb-card thumb-card--wine ${it.has_bottle ? "" : "thumb-card--no-bottle"}`}
                  title={`${it.producer} — ${it.wine_name}${it.vintage_text ? ` ${it.vintage_text}` : ""}`}
                >
                  <div className="thumb-card__bottle">
                    {it.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumb_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="thumb-card__bottle-placeholder" aria-hidden>
                        {/* Minimal bottle silhouette so the eye still parses the slot */}
                        <svg viewBox="0 0 24 72" width="24" height="72" fill="currentColor">
                          <rect x="9" y="0" width="6" height="16" rx="1" />
                          <path d="M8 16 Q8 22 6 26 L6 68 Q6 72 10 72 L14 72 Q18 72 18 68 L18 26 Q16 22 16 16 Z" />
                        </svg>
                      </div>
                    )}
                    {it.flag_count > 0 && (
                      <span className="thumb-card__flag" title={`${it.flag_count} open review item${it.flag_count === 1 ? "" : "s"}`}>
                        !
                      </span>
                    )}
                  </div>
                  <div className="thumb-card__label">
                    <div className="thumb-card__producer">{it.producer}</div>
                    <div className="thumb-card__wine">
                      {truncate(it.wine_name, 36)}
                      {it.vintage_text && <span className="thumb-card__vintage"> {it.vintage_text}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="thumb-strip__legend small muted">
        <span className="thumb-strip__legend-dot thumb-strip__legend-dot--flag">!</span>
        &nbsp;Open review item &middot;{" "}
        <span className="thumb-strip__legend-swatch thumb-strip__legend-swatch--structural" />
        &nbsp;Structural page (cover, divider, etc.)
      </p>
    </section>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function structuralGlyph(kind: string): string {
  // Simple character-based glyphs so the strip stays snappy. No external
  // icon library needed; the glyph is a cheap mnemonic for the section kind.
  switch (kind) {
    case "cover":
      return "✿"; // florette
    case "back_cover":
      return "✦"; // star
    case "intro":
      return "¶"; // pilcrow
    case "toc":
      return "☰"; // trigram (bars)
    case "regional_index":
      return "◆"; // diamond
    case "producer_intro":
      return "℟"; // script R
    case "producer_index":
      return "⁂"; // asterism
    case "divider":
      return "—"; // em dash
    case "contact":
      return "✉"; // envelope
    default:
      return "•"; // bullet
  }
}
