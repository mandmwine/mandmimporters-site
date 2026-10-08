// Editorial layout: 2 wines per page, side-by-side vertical halves.
//
// Reading-forward: no technical table, no map, no grid of score medallions.
// Each wine gets a bottle photo, name/vintage, appellation, one score, and
// the tasting note as prose — the sort of spread you'd find in a wine
// quarterly, where the copy carries the page.
//
// Phase 26 — audit §29 "Editorial render mode" ships.
import type { SheetData } from "./data";

export type EditorialPageData = {
  wines: SheetData[]; // 1 or 2 entries; the paginator always sends ≤ 2
  spread_title?: string | null; // optional running head (e.g. a section title)
};

export function EditorialPage({ data }: { data: EditorialPageData }) {
  const wines = data.wines.slice(0, 2);
  if (wines.length === 0) return null;

  return (
    <article className="sheet sheet--print editorial" data-count={wines.length}>
      <header className="editorial__head">
        <span className="editorial__brand">M &amp; M IMPORTS</span>
        {data.spread_title && <span className="editorial__running">{data.spread_title}</span>}
        <span className="editorial__brand editorial__brand--right">EDITORIAL</span>
      </header>

      <div className={`editorial__spread editorial__spread--${wines.length}`}>
        {wines.map((w, idx) => (
          <EditorialWine wine={w} key={w.wine.id} side={idx === 0 ? "left" : "right"} />
        ))}
      </div>

      <footer className="editorial__foot">
        <span className="editorial__foot-mark">Fine Wines &middot; Higher Conversations</span>
      </footer>
    </article>
  );
}

function EditorialWine({ wine: w, side }: { wine: SheetData; side: "left" | "right" }) {
  const primary = w.scores[0];
  const grapes = w.grapes
    .map((g) => (g.percentage ? `${Math.round(Number(g.percentage))}% ${g.name}` : g.name))
    .join(", ");
  const place = [w.location.appellation, w.location.subregion, w.location.region, w.location.country]
    .filter(Boolean)
    .join(" &middot; ");

  // Tasting-note excerpt: ~ 480 chars so two halves balance in height. The
  // editorial format trades the technical table for prose, so we show more
  // of the note here than the detailed sheet does by default.
  const note = (w.wine.tasting_note ?? "").trim();
  const noteExcerpt = note.length > 520 ? note.slice(0, 517).trimEnd() + "…" : note;

  const subtitleParts = [
    w.wine.special_designation,
    w.location.appellation,
    w.location.subregion,
  ].filter(Boolean) as string[];

  return (
    <section className={`editorial__half editorial__half--${side}`}>
      <p className="editorial__eyebrow">{(place || "").toUpperCase()}</p>

      <div className="editorial__title-block">
        <p className="editorial__vintage">{w.wine.vintage_text ?? "NV"}</p>
        <h2 className="editorial__name">{w.wine.display_name}</h2>
        {subtitleParts.length > 0 && (
          <p className="editorial__subtitle">{subtitleParts.join(" · ")}</p>
        )}
      </div>

      <div className="editorial__media">
        <div className="editorial__bottle">
          {w.bottle_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={w.bottle_image_url} alt={w.wine.display_name} />
          ) : (
            <div className="editorial__bottle-missing">No bottle</div>
          )}
        </div>
        {primary && (
          <div className="editorial__score">
            <span className="editorial__score-num">{primary.score_text}</span>
            <span className="editorial__score-critic">{primary.short_label ?? primary.critic ?? ""}</span>
            {primary.vintage_text && !primary.current_vintage && (
              <span className="editorial__score-vintage">{primary.vintage_text}</span>
            )}
          </div>
        )}
      </div>

      {noteExcerpt && <p className="editorial__note">{noteExcerpt}</p>}

      <dl className="editorial__meta">
        {grapes && (
          <div><dt>Grapes</dt><dd>{grapes}</dd></div>
        )}
        {w.wine.aging_display && (
          <div><dt>Aging</dt><dd>{w.wine.aging_display}</dd></div>
        )}
        {w.wine.supervision_display && (
          <div><dt>Kashrut</dt><dd>{w.wine.supervision_display}{w.wine.mevushal ? " · Mevushal" : ""}</dd></div>
        )}
      </dl>

      {w.producer_note && (
        <p className="editorial__producer-note">
          <span className="editorial__producer-mark">{w.wine.producer}</span>
          <span>&nbsp;&middot;&nbsp;</span>
          {w.producer_note}
        </p>
      )}
    </section>
  );
}
