// Standard single-wine catalog sheet.
//
// Visual target: a controlled blend of approved Template 01 + Template 06
// (see cms/docs/approved-reference-template-*.png, documented in
// cms/AUDIT_AND_REBUILD_DIRECTIVE_2026-10-08.md).
//
// Composition — one letter page, exactly seven visual elements:
//   1. Identity header (vintage, wine name, subtitle, designation)       — full width
//   2. Bottle                                                           — left column
//   3. Place + map                                                      — right column, top
//   4. Scores (0-4, contracts gracefully)                               — right column
//   5. Technical details (ruled label/value, missing fields omitted)    — right column
//   6. Tasting note | Winery note                                       — full-width, two col
//   7. M&M footer                                                       — full width
//
// Rules enforced here (section 43 of the directive):
//   - wine name immediately visible, large, serif
//   - bottle anchors the left column, no visible frame
//   - map read without zooming
//   - no "not recorded" ever renders — missing fields are omitted outright
//   - 0-4 scores all look intentional (no empty reserved slots)
//   - long names shrink in classed steps, never silently to <9pt
//   - trade pricing (Phase 15) kept intact, hidden by default
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
  if (v == null) return null;
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

// The wine name without the producer prefix duplicated (so "Vallepicciola
// Chianti Classico Riserva" becomes "Chianti Classico Riserva" when producer
// is "Vallepicciola" and shows as such). The producer appears separately.
function wineTitle(data: SheetData): string {
  const name = (data.wine.canonical_name || data.wine.display_name || "").trim();
  const producer = data.wine.producer.trim();
  if (producer && name.toLowerCase().startsWith(producer.toLowerCase() + " ")) {
    return name.slice(producer.length).trim();
  }
  return name;
}

// Choose a title-size class so a long Burgundy or Bordeaux name doesn't
// destroy the layout. Section 43 forbids silent shrinking below 9pt — here we
// step through three sizes and stop.
function titleClass(title: string): string {
  const n = title.length;
  if (n > 40) return "sheet__wine-name sheet__wine-name--sm";
  if (n > 26) return "sheet__wine-name sheet__wine-name--md";
  return "sheet__wine-name";
}

// Subtitle = whatever's left after the title line already said. If title
// already contains the appellation or the designation, don't repeat it.
function subtitleParts(data: SheetData, title: string): { line1: string | null; line2: string | null } {
  const designation = data.wine.special_designation?.trim() ?? null;
  const appellation = data.location.appellation ?? data.location.subregion ?? data.location.region ?? null;
  const t = title.toLowerCase();
  const line1Candidate = appellation && !t.includes(appellation.toLowerCase()) ? appellation : null;
  const line2Candidate = designation && !t.includes(designation.toLowerCase()) ? designation : null;
  // Prefer the appellation on line 1; use the designation (small) under it.
  return { line1: line1Candidate, line2: line2Candidate };
}

// A clean "REGION, COUNTRY" eyebrow (template 06).
function placeEyebrow(data: SheetData): string {
  const region = data.location.region ?? data.location.subregion ?? data.location.country;
  const country = data.location.country && data.location.country !== region ? data.location.country : null;
  return [region, country].filter(Boolean).join(", ");
}

// A compact critic short-label — "JS", "VINOUS", "WA". Falls back to the
// critic's initials when the critic row has no short_label.
function criticShort(s: SheetData["scores"][number]): string {
  if (s.short_label) return s.short_label.toUpperCase();
  if (!s.critic) return "—";
  return s.critic.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
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
  const { line1: subLine1, line2: subLine2 } = subtitleParts(data, title);
  const place = placeEyebrow(data);
  const appellation = data.location.appellation ?? data.location.subregion ?? data.location.region ?? null;
  const map = renderRegionMap(
    data.location,
    data.geoMap,
    `${data.wine.canonical_name} ${data.wine.special_designation ?? ""}`,
  );
  const scores = data.scores.filter((s) => s.score_text?.trim()).slice(0, 4);

  // Technical fields — rendered only when they have a value. Nothing says
  // "not recorded" on a sheet (section 8.5 / 43).
  const specs: Array<[string, string]> = [];
  specs.push(["Producer", data.wine.producer]);
  if (place) specs.push(["Region / Appellation", [appellation, data.location.region && data.location.region !== appellation ? data.location.region : null, data.location.country].filter(Boolean).join(", ")]);
  const blend = formatBlend(data.grapes);
  if (blend) specs.push(["Varietal", blend]);
  if (data.wine.aging_display) specs.push(["Aging", data.wine.aging_display]);
  if (data.wine.bottle_sizes.length) specs.push(["Size", data.wine.bottle_sizes.join(", ")]);
  if (data.wine.mevushal === "yes" || data.wine.mevushal === "no") {
    specs.push(["Mevushal", data.wine.mevushal === "yes" ? "Yes" : "No"]);
  }
  if (data.wine.supervision_display) specs.push(["Supervision", data.wine.supervision_display]);
  const designationFlags: string[] = [];
  if (data.wine.first_kosher_vintage) designationFlags.push("First kosher vintage");
  if (data.wine.organic) designationFlags.push("Organic");
  if (data.wine.biodynamic) designationFlags.push("Biodynamic");
  if (designationFlags.length) specs.push(["Other", designationFlags.join(" · ")]);

  return (
    <article className={`sheet sheet--${mode}`} data-wine-id={data.wine.id}>

      {/* 1. Identity header — full-width, centered, template 06 style */}
      <header className="sheet__head">
        <div className="sheet__head-mark" aria-hidden="true">
          <span className="sheet__head-rule" />
          <span className="sheet__head-mark-dot" />
          <span className="sheet__head-rule" />
        </div>
        {data.wine.vintage_text && (
          <div className="sheet__vintage">{data.wine.vintage_text}</div>
        )}
        <h1 className={titleClass(title)}>{title}</h1>
        {subLine1 && <p className="sheet__wine-sub">{subLine1}</p>}
        {subLine2 && <p className="sheet__wine-sub sheet__wine-sub--small">{subLine2}</p>}
      </header>

      <div className="sheet__divider" aria-hidden="true" />

      {/* 2 + 3 + 4 + 5. Body — bottle left; place, map, scores, technical right */}
      <div className="sheet__body">
        <aside className="sheet__bottle-col">
          {data.bottle_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="sheet__bottle" src={data.bottle_image_url} alt={data.wine.display_name} />
          ) : (
            <div className="sheet__bottle-missing"><span>Bottle image needed</span></div>
          )}
        </aside>

        <main className="sheet__content-col">
          <div className="sheet__place-block">
            <div className="sheet__place-text">
              {place && <p className="sheet__place-eyebrow">{place}</p>}
              {appellation && <p className="sheet__place-appellation">{appellation}{data.wine.special_designation ? ` ${data.wine.special_designation}` : ""}</p>}
            </div>
            {map && <div className="sheet__map">{map}</div>}
          </div>

          {scores.length > 0 && (
            <section className="sheet__scores" aria-label="Critic scores">
              <ul className={`sheet__scores-row sheet__scores-row--${scores.length}`}>
                {scores.map((s, i) => (
                  <li className="sheet__score" key={i}>
                    <div className="sheet__score-ring">
                      <span className="sheet__score-critic">{criticShort(s)}</span>
                      <span className="sheet__score-num">{s.score_text}</span>
                    </div>
                    {!s.current_vintage && s.vintage_text && (
                      <span className="sheet__score-vintage">{s.vintage_text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="sheet__technical" aria-label="Technical details">
            <h3 className="sheet__label">Technical Details</h3>
            <table className="sheet__specs">
              <tbody>
                {specs.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>

      {/* 6. Tasting Note | Winery Note — full width, two columns */}
      {(data.wine.tasting_note || data.producer_note) && (
        <>
          <div className="sheet__divider" aria-hidden="true" />
          <div className="sheet__notes">
            {data.wine.tasting_note && (
              <section className="sheet__note">
                <h3 className="sheet__label">Tasting Note</h3>
                <p className="sheet__copy">{data.wine.tasting_note}</p>
              </section>
            )}
            {data.producer_note && (
              <section className="sheet__note">
                <h3 className="sheet__label">Winery</h3>
                <p className="sheet__copy">{data.producer_note}</p>
              </section>
            )}
          </div>
        </>
      )}

      {/* Phase 15 trade pricing — only when a catalog opts in. Kept full-width
          below the notes so it never competes with the primary data hierarchy. */}
      {priceOptions?.show_prices && data.prices.length > 0 && (
        <>
          <div className="sheet__divider" aria-hidden="true" />
          <section className="sheet__trade">
            <h3 className="sheet__label">Trade Pricing</h3>
            {priceOptions.price_tier === "ladder" ? (
              <table className="sheet__trade-table">
                <thead>
                  <tr><th>Tier</th><th className="right">Case</th><th className="right">Bottle</th></tr>
                </thead>
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
              return <p className="sheet__copy sheet__trade-line"><strong>{TIER_LABEL[row.tier] ?? row.tier}:</strong>{c ? ` ${c} / case` : ""}{c && b ? " · " : ""}{b ? `${b} / bottle` : ""}</p>;
            })()}
            {priceOptions.show_stock && data.stock.available && (
              <p className="sheet__copy sheet__trade-stock">
                <strong>{Math.floor(parseFloat(data.stock.available))}</strong> cs available
                {data.wine.pack_size ? ` · ${data.wine.pack_size}/case` : ""}
                {data.wine.sku ? ` · ${data.wine.sku}` : ""}
              </p>
            )}
          </section>
        </>
      )}

      {/* 7. Footer — gold hairline, centered mark + tagline */}
      <footer className="sheet__foot">
        <div className="sheet__foot-rule" aria-hidden="true" />
        <div className="sheet__brand">M &amp; M IMPORTS</div>
        <div className="sheet__tagline">Fine Wines · Higher Conversations</div>
      </footer>
    </article>
  );
}
