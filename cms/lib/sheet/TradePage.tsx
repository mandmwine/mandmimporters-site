// Trade overview: dense portfolio sheet. 4 or 8 wines per page in a tight grid.
// Bottle, name/vintage, region, blend, mevushal, top score, short note.
import type { SheetData } from "./data";

export type TradeData = {
  title: string;
  subtitle?: string;
  wines: SheetData[];     // up to 8 per page
};

export function TradePage({ data }: { data: TradeData }) {
  const wines = data.wines.slice(0, 8);
  return (
    <article className="sheet sheet--print trade" data-count={wines.length}>
      <header className="trade__head">
        <p className="trade__eyebrow">Exceptional wines, extraordinary places</p>
        <h1 className="trade__title">{data.title}</h1>
        {data.subtitle && <p className="trade__sub">{data.subtitle}</p>}
      </header>

      <div className={`trade__grid trade__grid--${wines.length}`}>
        {wines.map((w) => {
          const scores = w.scores.slice(0, 2);
          const blend = w.grapes.map((g) => g.name).join(", ");
          const mevushal = w.wine.mevushal === "yes" ? "Mevushal" : null;
          const region = [w.location.appellation ?? w.location.region, w.location.country].filter(Boolean).join(", ");
          return (
            <div className="trade__wine" key={w.wine.id}>
              <div className="trade__bottle-cell">
                {w.bottle_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.bottle_image_url} alt={w.wine.display_name} />
                )}
                {scores.length > 0 && (
                  <ul className="trade__scores">
                    {scores.map((s, i) => (
                      <li key={i}>
                        <span className="trade__score-num">{s.score_text}</span>
                        <span className="trade__score-critic">{s.short_label ?? "WA"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="trade__meta">
                <h3 className="trade__wine-name">{w.wine.canonical_name || w.wine.display_name}</h3>
                <p className="trade__wine-sub">
                  {w.wine.vintage_text ?? "NV"}
                  {region ? ` · ${region}` : ""}
                </p>
                <dl className="trade__specs">
                  {blend && (
                    <>
                      <dt>Varietal</dt>
                      <dd>{blend}</dd>
                    </>
                  )}
                  {w.wine.special_designation && (
                    <>
                      <dt>Designation</dt>
                      <dd>{w.wine.special_designation}</dd>
                    </>
                  )}
                  {w.wine.bottle_sizes.length > 0 && (
                    <>
                      <dt>Size</dt>
                      <dd>{w.wine.bottle_sizes.join(", ")}</dd>
                    </>
                  )}
                  {mevushal && (
                    <>
                      <dt>&nbsp;</dt>
                      <dd className="trade__badge">{mevushal}</dd>
                    </>
                  )}
                </dl>
                {w.wine.short_description && <p className="trade__one-liner">{w.wine.short_description}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="trade__foot">
        <span className="sheet__brand-mark">M &amp; M IMPORTS</span>
        <span className="sheet__brand-sub">www.mmimports.com · office@mandmimporters.com</span>
      </footer>
    </article>
  );
}
