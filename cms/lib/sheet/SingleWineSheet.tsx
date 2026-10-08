// Unified single-wine catalog data sheet.
// The standard sheet is deliberately restrained: one hero bottle, one small
// locator map, scores, technical facts, concise tasting/winery notes, and the
// M&M footer. Decorative/editorial imagery belongs in editorial layouts, not
// on this universal trade/data sheet.
import type { SheetData } from "./data";
import type { SheetPriceOptions } from "./catalog-html";
import { renderRegionMap } from "./region-map";

const TIER_LABEL: Record<string, string> = {
  frontline: "FrontLine",
  "2cs": "2 cs",
  "3cs": "3 cs",
  "4cs": "4 cs",
  "5cs": "5 cs",
  "10cs": "10 cs",
  "25cs": "25 cs",
};

function moneyFmt(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBlend(grapes: SheetData["grapes"]): string {
  if (!grapes.length) return "";
  const hasPct = grapes.some((g) => g.percentage !== null);
  if (!hasPct) return grapes.map((g) => g.name).join(", ");
  return grapes.map((g) => {
    if (g.percentage === null) return g.name;
    const n = Number(g.percentage);
    return `${Number.isInteger(n) ? n : n.toFixed(1)}% ${g.name}`;
  }).join(", ");
}

function regionAppellation(data: SheetData): string {
  const { appellation, subregion, region, country } = data.location;
  const primary = appellation ?? subregion ?? region;
  return [primary, region && region !== primary ? region : null, country].filter(Boolean).join(", ");
}

function wineTitle(data: SheetData): string {
  const name = (data.wine.canonical_name || data.wine.display_name || "").trim();
  const producer = data.wine.producer.trim();
  if (producer && name.toLowerCase().startsWith(producer.toLowerCase() + " ")) {
    return name.slice(producer.length).trim();
  }
  return name;
}

function subtitle(data: SheetData, title: string): string {
  const loc = data.location.appellation ?? data.location.subregion ?? data.location.region;
  const designation = data.wine.special_designation?.trim();
  const t = title.toLowerCase();
  const hasLoc = Boolean(loc && t.includes(loc.toLowerCase()));
  const hasDesignation = Boolean(designation && t.includes(designation.toLowerCase()));
  if (hasLoc && hasDesignation) return "";
  if (hasLoc) return designation ?? "";
  if (hasDesignation) return loc ?? "";
  if (!loc) return designation ?? "";
  if (!designation) return loc;
  return `${loc} · ${designation}`;
}

function titleClass(title: string): string {
  const n = title.length;
  if (n > 44) return "sheet__wine-name sheet__wine-name--small";
  if (n > 30) return "sheet__wine-name sheet__wine-name--medium";
  return "sheet__wine-name";
}

export function SingleWineSheet({
  data,
  mode = "screen",
  priceOptions,
}: {
  data: SheetData;
  mode?: "screen" | "print";
  priceOptions?: SheetPriceOptions;
}) {
  const title = wineTitle(data) || data.wine.display_name;
  const map = renderRegionMap(
    data.location,
    data.geoMap,
    `${data.wine.canonical_name} ${data.wine.special_designation ?? ""}`,
  );
  const scores = data.scores.slice(0, 4);
  const technical: [string, string | null][] = [
    ["Producer", data.wine.producer],
    ["Region / Appellation", regionAppellation(data) || null],
    ["Varietal", formatBlend(data.grapes) || null],
    ["Aging", data.wine.aging_display],
    ["Size", data.wine.bottle_sizes.join(", ") || null],
    ["Mevushal", data.wine.mevushal === "unknown" ? null : data.wine.mevushal === "yes" ? "Yes" : "No"],
    ["Supervision", data.wine.supervision_display],
  ];
  const designations: string[] = [];
  if (data.wine.first_kosher_vintage) designations.push("First kosher vintage");
  if (data.wine.organic) designations.push("Organic");
  if (data.wine.biodynamic) designations.push("Biodynamic");
  if (designations.length) technical.push(["Other", designations.join(" · ")]);

  return (
    <article className={`sheet sheet--${mode}`} data-wine-id={data.wine.id}>
      <div className="sheet__top-rule" aria-hidden="true" />

      <div className="sheet__layout">
        <aside className="sheet__visual-column">
          <div className="sheet__bottle">
            {data.bottle_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.bottle_image_url} alt={data.wine.display_name} />
            ) : (
              <div className="sheet__bottle-missing"><span>Bottle image needed</span></div>
            )}
          </div>
          <div className="sheet__map-wrap">{map}</div>
        </aside>

        <main className="sheet__content-column">
          <header className="sheet__head">
            <div className="sheet__vintage">{data.wine.vintage_text ?? "NV"}</div>
            <p className="sheet__producer-eyebrow">{data.wine.producer}</p>
            <h1 className={titleClass(title)}>{title}</h1>
            {subtitle(data, title) && <h2 className="sheet__wine-sub">{subtitle(data, title)}</h2>}
            <p className="sheet__location-line">
              {[data.location.region, data.location.country].filter(Boolean).join(" · ")}
            </p>
          </header>

          {scores.length > 0 && (
            <section className="sheet__section sheet__scores" aria-label="Critic scores">
              <h3 className="sheet__section-label">Scores</h3>
              <div className="sheet__scores-row">
                {scores.map((s, i) => {
                  const label = s.award_text?.toUpperCase() ?? s.short_label ?? (s.critic ?? "").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3);
                  return (
                    <div className="sheet__score" key={i}>
                      <div className="sheet__score-ring">
                        <span className="sheet__score-num">{s.score_text}</span>
                        <span className="sheet__score-label">{label}</span>
                      </div>
                      <div className="sheet__score-critic">{s.critic ?? ""}</div>
                      {!s.current_vintage && s.vintage_text && <div className="sheet__score-vintage">{s.vintage_text} vintage</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="sheet__section sheet__technical">
            <h3 className="sheet__section-label">Technical Details</h3>
            <dl className="sheet__specs">
              {technical.map(([k, v]) => v ? (
                <div className="sheet__spec" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ) : null)}
            </dl>
          </section>

          {data.wine.tasting_note && (
            <section className="sheet__section sheet__note-section">
              <h3 className="sheet__section-label">Tasting Note</h3>
              <p className="sheet__copy">{data.wine.tasting_note}</p>
            </section>
          )}

          {data.producer_note && (
            <section className="sheet__section sheet__note-section">
              <h3 className="sheet__section-label">Winery Note</h3>
              <p className="sheet__copy sheet__copy--winery">{data.producer_note}</p>
            </section>
          )}

          {priceOptions?.show_prices && data.prices.length > 0 && (
            <section className="sheet__section sheet__prices">
              <h3 className="sheet__section-label">Trade Pricing</h3>
              {priceOptions.price_tier === "ladder" ? (
                <table className="sheet__prices-table">
                  <thead><tr><th>Tier</th><th className="right">Case</th><th className="right">Bottle</th></tr></thead>
                  <tbody>
                    {data.prices.map((p) => (
                      <tr key={p.tier}>
                        <td>{TIER_LABEL[p.tier] ?? p.tier}</td>
                        <td className="right">{moneyFmt(p.case_price) ?? "—"}</td>
                        <td className="right">{moneyFmt(p.bottle_price) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (() => {
                const row = data.prices.find((p) => p.tier === priceOptions.price_tier);
                if (!row) return null;
                const c = moneyFmt(row.case_price);
                const b = moneyFmt(row.bottle_price);
                return <p className="sheet__copy"><strong>{TIER_LABEL[row.tier] ?? row.tier}:</strong>{c ? ` ${c} / case` : ""}{c && b ? " · " : ""}{b ? `${b} / bottle` : ""}</p>;
              })()}
              {priceOptions.show_stock && data.stock.available && (
                <p className="sheet__copy small"><strong>{Math.floor(parseFloat(data.stock.available))}</strong> cs available{data.wine.pack_size ? ` · ${data.wine.pack_size}/case` : ""}{data.wine.sku ? ` · ${data.wine.sku}` : ""}</p>
              )}
            </section>
          )}
        </main>
      </div>

      <footer className="sheet__foot">
        <div className="sheet__foot-line" />
        <div className="sheet__foot-brand">
          <div className="sheet__brand-mark">M &amp; M IMPORTS</div>
          <div className="sheet__brand-sub">Fine Wines · Higher Conversations</div>
        </div>
        <div className="sheet__foot-line" />
      </footer>
    </article>
  );
}
