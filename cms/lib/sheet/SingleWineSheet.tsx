// Reusable React component for the Template-05 style single-wine sheet.
// Used by:
//   - /catalog-admin/sheet/[id]          (preview in-browser)
//   - /catalog-admin/api/wines/[id]/pdf  (headless Chrome rendering)
import type { SheetData } from "./data";
import { renderRegionMap } from "./region-map";

const PAIRING_TAGLINES: Record<string, string> = {
  red: "Great wines bring people together",
  white: "Clarity, light, and the pleasure of good company",
  rose: "Softer afternoons, longer conversations",
  sparkling: "Occasions worth marking",
  dessert: "The slow close to a long table",
  fortified: "Fireside, deliberate, unhurried",
  orange: "Different grammar, same hospitality",
  other: "Great wines bring people together",
};

function formatBlend(grapes: SheetData["grapes"]): string {
  if (!grapes.length) return "";
  const hasPct = grapes.some((g) => g.percentage !== null);
  if (!hasPct) return grapes.map((g) => g.name).join(", ");
  return grapes
    .map((g) => {
      if (g.percentage === null) return g.name;
      const n = Number(g.percentage);
      const label = Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
      return `${label} ${g.name}`;
    })
    .join(", ");
}

function regionAppellation(data: SheetData): string {
  const { appellation, region, country } = data.location;
  return [appellation ?? region, country].filter(Boolean).join(", ");
}

function fullDesignation(data: SheetData): string {
  const parts: string[] = [];
  if (data.location.appellation) parts.push(data.location.appellation);
  if (data.wine.special_designation) parts.push(data.wine.special_designation);
  return parts.join(" ");
}

// Soft "tagline" line under the title. Uses the category or a sensible default.
function tagline(data: SheetData): string {
  const cat = data.wine.category ?? "other";
  return PAIRING_TAGLINES[cat] ?? PAIRING_TAGLINES.other;
}

export function SingleWineSheet({ data, mode = "screen" }: { data: SheetData; mode?: "screen" | "print" }) {
  const map = renderRegionMap(data.location);
  const designation = fullDesignation(data);
  const subhead = regionAppellation(data);
  const scores = data.scores.slice(0, 4);
  const technical: [string, string | null][] = [
    ["Producer", data.wine.producer],
    ["Region / Appellation", subhead || null],
    ["Varietal", formatBlend(data.grapes) || null],
    ["Aging", data.wine.aging_display],
    ["Size", data.wine.bottle_sizes.join(", ") || null],
    ["Mevushal", data.wine.mevushal === "unknown" ? null : data.wine.mevushal === "yes" ? "Yes" : "No"],
    ["Supervision", data.wine.supervision_display],
  ];
  const extras: string[] = [];
  if (data.wine.first_kosher_vintage) extras.push("First kosher vintage");
  if (data.wine.organic) extras.push("Organic");
  if (data.wine.biodynamic) extras.push("Biodynamic");
  if (extras.length) technical.push(["Designations", extras.join(" · ")]);

  const corner = tagline(data).toUpperCase();

  return (
    <article className={`sheet sheet--${mode}`} data-wine-id={data.wine.id}>
      <header className="sheet__head">
        <div className="sheet__corner">
          <span className="sheet__corner-left" aria-hidden="true" />
          <span className="sheet__corner-right">{corner}</span>
        </div>

        <div className="sheet__title-row">
          <div className="sheet__title-col">
            <div className="sheet__vintage">{data.wine.vintage_text ?? "NV"}</div>
            <h1 className="sheet__wine-name">{data.wine.producer}</h1>
            <h2 className="sheet__wine-sub">{designation || data.wine.canonical_name}</h2>
            <div className="sheet__rule">
              <span className="sheet__rule-mark" />
              <span className="sheet__tagline">{tagline(data)}</span>
            </div>
          </div>
          <div className="sheet__map-col">{map}</div>
        </div>
      </header>

      {scores.length > 0 && (
        <section className="sheet__section sheet__scores">
          <h3 className="sheet__section-label">Scores</h3>
          <div className="sheet__scores-row">
            {scores.map((s, i) => {
              const label = s.short_label ?? (s.critic ?? "").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3);
              const award = s.award_text?.toUpperCase();
              return (
                <div className="sheet__score" key={i}>
                  <div className="sheet__score-num">{s.score_text}</div>
                  <div className="sheet__score-label">{award ?? label}</div>
                  <div className="sheet__score-critic">{s.critic ?? ""}</div>
                  {!s.current_vintage && s.vintage_text && (
                    <div className="sheet__score-vintage">{s.vintage_text} vintage</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {scores.length === 0 && (
        <section className="sheet__section sheet__scores sheet__scores--empty">
          <h3 className="sheet__section-label">Scores</h3>
          <p className="sheet__awaiting">Awaiting scores</p>
        </section>
      )}

      <div className="sheet__body">
        <div className="sheet__body-col">
          <section className="sheet__section">
            <h3 className="sheet__section-label">Technical Details</h3>
            <dl className="sheet__specs">
              {technical.map(([k, v]) =>
                v ? (
                  <div className="sheet__spec" key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </section>

          {data.wine.tasting_note && (
            <section className="sheet__section">
              <h3 className="sheet__section-label">Tasting Note</h3>
              <p className="sheet__copy">{data.wine.tasting_note}</p>
            </section>
          )}

          {data.producer_note && (
            <section className="sheet__section">
              <h3 className="sheet__section-label">Winery Note</h3>
              <p className="sheet__copy">{data.producer_note}</p>
            </section>
          )}
        </div>

        <div className="sheet__bottle">
          {data.bottle_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.bottle_image_url} alt={data.wine.display_name} />
          ) : (
            <div className="sheet__bottle-missing">
              <span>Bottle image needed</span>
            </div>
          )}
        </div>
      </div>

      <footer className="sheet__foot">
        <div className="sheet__foot-left" />
        <div className="sheet__foot-brand">
          <div className="sheet__brand-mark">M &amp; M IMPORTS</div>
          <div className="sheet__brand-sub">Fine Wines · Higher Conversations</div>
        </div>
        <div className="sheet__foot-right" />
      </footer>
    </article>
  );
}
