// Trade overview: dense portfolio sheet. 4 or 8 wines per page in a tight grid.
// Bottle, name/vintage, region, blend, mevushal, top score, short note.
// Each wine carries a small QR code linking to its public M&M page so buyers
// can scan from a printed sheet.
import type { SheetData } from "./data";
import type { SheetPriceOptions } from "./catalog-html";

export type TradeData = {
  title: string;
  subtitle?: string;
  wines: SheetData[];     // up to 8 per page
};

const TIER_LABEL: Record<string, string> = {
  frontline: "FrontLine",
  "2cs": "2 cs",
  "3cs": "3 cs",
  "4cs": "4 cs",
  "5cs": "5 cs",
  "10cs": "10 cs",
  "25cs": "25 cs",
};

function money(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Compact single-tier line used when the catalog is scoped to one tier.
function singleTierLine(prices: SheetData["prices"], tier: string): string | null {
  const row = prices.find((p) => p.tier === tier);
  if (!row) return null;
  const bits: string[] = [];
  const c = money(row.case_price);
  const b = money(row.bottle_price);
  if (c) bits.push(`${c} / cs`);
  if (b) bits.push(`${b} / btl`);
  return bits.length ? `${TIER_LABEL[tier] ?? tier}: ${bits.join(" · ")}` : null;
}

export function TradePage({ data, priceOptions }: { data: TradeData; priceOptions?: SheetPriceOptions }) {
  const wines = data.wines.slice(0, 8);
  const showPrices = Boolean(priceOptions?.show_prices);
  const showStock = Boolean(priceOptions?.show_stock);
  const priceTier = priceOptions?.price_tier ?? "ladder";
  return (
    <article className="sheet sheet--print trade" data-count={wines.length}>
      <header className="trade__head">
        <p className="trade__eyebrow">Trade Portfolio</p>
        <h1 className="trade__title">{data.title}</h1>
        {data.subtitle && <p className="trade__sub">{data.subtitle}</p>}
      </header>

      <div className={`trade__grid trade__grid--${wines.length}`}>
        {wines.map((w) => {
          const scores = w.scores.slice(0, 2);
          const blend = w.grapes.map((g) => g.name).join(", ");
          const mevushal = w.wine.mevushal === "yes" ? "Mevushal" : null;
          const region = [w.location.appellation ?? w.location.region, w.location.country].filter(Boolean).join(", ");
          const publicUrl = w.wine.website_slug
            ? `https://www.mandmimporters.com/wines/p/${w.wine.website_slug}`
            : null;
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
                {showPrices && (
                  priceTier === "ladder" && w.prices.length > 0 ? (
                    <table className="trade__prices">
                      <thead>
                        <tr>
                          <th>Tier</th>
                          <th className="right">Case</th>
                          <th className="right">Btl</th>
                        </tr>
                      </thead>
                      <tbody>
                        {w.prices.map((p) => (
                          <tr key={p.tier}>
                            <td>{TIER_LABEL[p.tier] ?? p.tier}</td>
                            <td className="right">{money(p.case_price) ?? "—"}</td>
                            <td className="right">{money(p.bottle_price) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    (() => {
                      const line = singleTierLine(w.prices, priceTier);
                      return line ? <p className="trade__price-line">{line}</p> : null;
                    })()
                  )
                )}
                {showStock && w.stock.available && (
                  <p className="trade__stock-line">
                    <strong>{Math.floor(parseFloat(w.stock.available))}</strong> cs available
                    {w.wine.pack_size ? ` · ${w.wine.pack_size}/case` : ""}
                    {w.wine.sku ? <> · <span className="trade__sku">{w.wine.sku}</span></> : null}
                  </p>
                )}
              </div>
              {publicUrl && w.wine.qr_svg && (
                <div className="trade__qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: w.wine.qr_svg }} />
              )}
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
