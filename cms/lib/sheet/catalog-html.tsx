// Builds the HTML for every page of a catalog in one document so Chromium
// prints them as a single multi-page PDF. Each page is a .sheet or a cover/
// divider block that ends with page-break-after: always.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { one, query } from "@/lib/db";
import { loadSheetData, type SheetData } from "./data";
import { SingleWineSheet } from "./SingleWineSheet";
import { LineupPage } from "./LineupPage";
import { TradePage } from "./TradePage";
import { EditorialPage } from "./EditorialPage";
import { inlineFontFaces } from "./fonts";

export type Preset = "print" | "email" | "web";

let cachedCss: string | null = null;
async function sheetCss(): Promise<string> {
  if (cachedCss !== null) return cachedCss;
  const cssPath = path.join(process.cwd(), "lib", "sheet", "sheet.css");
  cachedCss = await readFile(cssPath, "utf8");
  return cachedCss;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

type SectionRow = {
  id: string;
  kind: string;
  title: string | null;
  position: number;
  settings: Record<string, unknown>;
};

type ItemRow = {
  id: string;
  section_id: string | null;
  wine_vintage_id: string;
  position: number;
  render_mode_override: string | null;
};

type CatalogRow = {
  id: string;
  name: string;
  season: string | null;
  render_mode: string;
  settings: Record<string, unknown>;
};

// Phase 15 — pricing & stock options passed through to the renderers.
// show_prices + price_tier come straight from catalogs.settings; price_tier
// of "ladder" means render the full table, otherwise render just that one tier.
export type SheetPriceOptions = {
  show_prices: boolean;
  price_tier: string;         // "ladder" | "frontline" | "2cs" | …
  show_stock: boolean;
};

function priceOptionsFromCatalog(c: CatalogRow): SheetPriceOptions {
  const s = c.settings ?? {};
  return {
    show_prices: Boolean(s.show_prices),
    price_tier: typeof s.price_tier === "string" && s.price_tier.length > 0 ? s.price_tier : "ladder",
    show_stock: Boolean(s.show_stock),
  };
}

// Group wine items into pages based on the section's layout.
function paginate(wines: SheetData[], layout: string): { kind: string; wines: SheetData[] }[] {
  const perPage: Record<string, number> = {
    detailed: 1,
    editorial: 2, // Phase 26: reading-forward magazine spread, 2/page.
    lineup: 4,
    compact: 6,
    trade: 8,
  };
  const n = perPage[layout] ?? 1;
  if (n === 1) return wines.map((w) => ({ kind: "detailed", wines: [w] }));
  const pages: { kind: string; wines: SheetData[] }[] = [];
  for (let i = 0; i < wines.length; i += n) {
    pages.push({ kind: layout, wines: wines.slice(i, i + n) });
  }
  return pages;
}

export type CatalogPlan = {
  catalog: CatalogRow;
  sections: SectionRow[];
  items: ItemRow[];
  wineDataById: Map<string, SheetData>;
};

export async function buildCatalogPlan(catalogId: string): Promise<CatalogPlan | null> {
  const catalog = await one<CatalogRow>(
    "SELECT id, name, season, render_mode, settings FROM catalogs WHERE id = $1",
    [catalogId],
  );
  if (!catalog) return null;
  const sections = await query<SectionRow>(
    "SELECT id, kind, title, position, settings FROM catalog_sections WHERE catalog_id = $1 ORDER BY position",
    [catalogId],
  );
  const items = await query<ItemRow>(
    "SELECT id, section_id, wine_vintage_id, position, render_mode_override FROM catalog_items WHERE catalog_id = $1 ORDER BY position",
    [catalogId],
  );
  const wineDataById = new Map<string, SheetData>();
  for (const it of items) {
    if (wineDataById.has(it.wine_vintage_id)) continue;
    const d = await loadSheetData(it.wine_vintage_id);
    if (d) wineDataById.set(it.wine_vintage_id, d);
  }
  return { catalog, sections, items, wineDataById };
}

// Returns a complete HTML document that renders every page of the catalog.
export async function catalogHtml(plan: CatalogPlan, preset: Preset): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const css = await sheetCss();
  const parts: string[] = [];
  const toc: { title: string; page: number }[] = [];
  let pageCount = 0;
  const priceOptions = priceOptionsFromCatalog(plan.catalog);

  for (const sec of plan.sections) {
    const title = sec.title ?? sec.kind;
    const layout = (sec.settings?.layout as string) || plan.catalog.render_mode || "detailed";

    switch (sec.kind) {
      case "cover":
        parts.push(renderToStaticMarkup(
          <div className="cover-page">
            <p className="cover__eyebrow">M &amp; M Imports</p>
            <h1 className="cover__title">{title}</h1>
            {plan.catalog.season && <p className="cover__sub">{plan.catalog.season}</p>}
          </div>,
        ));
        pageCount++;
        break;

      case "divider":
      case "producer_intro":
        pageCount++;
        toc.push({ title, page: pageCount });
        parts.push(renderToStaticMarkup(
          <div className="divider-page">
            <h2 className="divider__title">{title}</h2>
            {sec.kind === "producer_intro" && <p className="divider__sub">Producer</p>}
          </div>,
        ));
        break;

      case "toc":
        // Placeholder — we render the real TOC after collecting pages.
        pageCount++;
        parts.push("<!--TOC_PLACEHOLDER-->");
        break;

      case "regional_index":
      case "producer_index": {
        pageCount++;
        toc.push({ title, page: pageCount });
        const grouping = sec.kind === "regional_index" ? "by region" : "by producer";
        parts.push(renderToStaticMarkup(
          <div className="divider-page">
            <h2 className="divider__title">{title}</h2>
            <p className="divider__sub">Index {grouping}</p>
          </div>,
        ));
        break;
      }

      case "contact":
        pageCount++;
        toc.push({ title, page: pageCount });
        parts.push(renderToStaticMarkup(
          <div className="contact-page">
            <h2 className="contact__title">Contact</h2>
            <div className="contact__body">
              <p>M &amp; M Imports</p>
              <p>1100 Coney Island Avenue<br/>Brooklyn, NY 11230</p>
              <p>718 684 9826 · office@mandmimporters.com</p>
              <p>www.mmimports.com</p>
            </div>
          </div>,
        ));
        break;

      case "back_cover":
        pageCount++;
        parts.push(renderToStaticMarkup(
          <div className="cover-page">
            <p className="cover__eyebrow">M &amp; M Imports</p>
            <p className="cover__sub">Fine Wines · Higher Conversations</p>
          </div>,
        ));
        break;

      case "intro":
        pageCount++;
        toc.push({ title, page: pageCount });
        parts.push(renderToStaticMarkup(
          <div className="divider-page">
            <h2 className="divider__title">{title}</h2>
            <p className="divider__sub">M &amp; M Imports</p>
          </div>,
        ));
        break;

      case "wines": {
        const sectionItems = plan.items
          .filter((i) => i.section_id === sec.id)
          .sort((a, b) => a.position - b.position);
        const wines: SheetData[] = [];
        for (const it of sectionItems) {
          const d = plan.wineDataById.get(it.wine_vintage_id);
          if (d) wines.push(d);
        }
        if (wines.length === 0) break;

        const pages = paginate(wines, layout);
        for (const p of pages) {
          pageCount++;
          if (p.kind === "detailed") {
            parts.push(renderToStaticMarkup(
              <SingleWineSheet data={p.wines[0]} mode="print" priceOptions={priceOptions} />,
            ));
          } else if (p.kind === "lineup" || p.kind === "compact") {
            const producer = p.wines[0]?.wine.producer ?? "";
            parts.push(renderToStaticMarkup(
              <LineupPage data={{ producer, wines: p.wines, producer_note: p.wines[0]?.producer_note }} />,
            ));
          } else if (p.kind === "editorial") {
            parts.push(renderToStaticMarkup(
              <EditorialPage data={{ wines: p.wines, spread_title: title }} />,
            ));
          } else if (p.kind === "trade") {
            parts.push(renderToStaticMarkup(
              <TradePage data={{ title: title ?? "Portfolio", wines: p.wines }} priceOptions={priceOptions} />,
            ));
          }
        }
        break;
      }
    }
  }

  // Fill the TOC placeholder if we actually used one.
  if (parts.includes("<!--TOC_PLACEHOLDER-->") && toc.length > 0) {
    const tocHtml = renderToStaticMarkup(
      <div className="toc-page">
        <h1>Contents</h1>
        <ol>
          {toc.map((t, i) => (
            <li key={i}>
              <strong>{t.title}</strong>
              <span className="toc-dot" style={{ borderBottom: "0.5pt dashed #c9bfa9" }} />
              <span className="toc-page-num">{t.page}</span>
            </li>
          ))}
        </ol>
      </div>,
    );
    const idx = parts.indexOf("<!--TOC_PLACEHOLDER-->");
    parts[idx] = tocHtml;
  }

  const fontFaces = await inlineFontFaces();

  // Preset-specific stylesheet tweaks. Email/web shrink huge images in-page
  // to produce a smaller resulting PDF; Chromium's pdf engine respects the
  // rendered pixel dimensions.
  const presetStyle =
    preset === "web"
      ? ".sheet__bottle img, .lineup__bottle, .trade__bottle-cell img { max-height: 3.2in !important; image-rendering: auto; }"
      : preset === "email"
      ? ".sheet__bottle img, .lineup__bottle, .trade__bottle-cell img { max-height: 5in; }"
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(plan.catalog.name)}</title>
${fontFaces}
<style>${css}
html,body{margin:0;background:#f7f3ea;}
${presetStyle}
</style>
</head>
<body>${parts.join("")}</body>
</html>`;
}
