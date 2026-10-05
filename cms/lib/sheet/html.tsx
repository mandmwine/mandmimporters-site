// Returns the full standalone HTML document used to generate the sheet PDF.
// Called by the PDF export route — puppeteer feeds this to Chromium via setContent.
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SingleWineSheet } from "./SingleWineSheet";
import type { SheetData } from "./data";

let cachedCss: string | null = null;
async function sheetCss(): Promise<string> {
  if (cachedCss !== null) return cachedCss;
  const cssPath = path.join(process.cwd(), "lib", "sheet", "sheet.css");
  cachedCss = await readFile(cssPath, "utf8");
  return cachedCss;
}

export async function sheetHtml(data: SheetData): Promise<string> {
  const body = renderToStaticMarkup(<SingleWineSheet data={data} mode="print" />);
  const css = await sheetCss();
  // Google Fonts stylesheet; the browser downloads the two families used by the sheet.
  const fontLink =
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.wine.producer)} ${escapeHtml(data.wine.vintage_text ?? "")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${fontLink}" rel="stylesheet" />
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
