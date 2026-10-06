// Returns the full standalone HTML document used to generate the sheet PDF.
// Called by the PDF export route — puppeteer feeds this to Chromium via setContent.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SingleWineSheet } from "./SingleWineSheet";
import type { SheetData } from "./data";
import { inlineFontFaces } from "./fonts";

let cachedCss: string | null = null;
async function sheetCss(): Promise<string> {
  if (cachedCss !== null) return cachedCss;
  const cssPath = path.join(process.cwd(), "lib", "sheet", "sheet.css");
  cachedCss = await readFile(cssPath, "utf8");
  return cachedCss;
}

export async function sheetHtml(data: SheetData): Promise<string> {
  // Dynamic import so Turbopack doesn't treat react-dom/server as a top-level import
  // of a module that could be reached from client code.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(<SingleWineSheet data={data} mode="print" />);
  const [css, fontFaces] = await Promise.all([sheetCss(), inlineFontFaces()]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.wine.producer)} ${escapeHtml(data.wine.vintage_text ?? "")}</title>
${fontFaces}
<style>${css}
html,body{margin:0;background:#f7f3ea;}
</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
