// Reads self-hosted Fontsource woff2 files from node_modules and returns a
// <style>@font-face{...}</style> block with the fonts inlined as base64
// data URLs. This removes the Google Fonts dependency at PDF export time —
// Chromium doesn't need to reach the public internet to render the sheet.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

type FontDef = {
  family: string;
  weight: 400 | 500 | 600;
  // Fontsource filename pattern: <subset>-<weight>-<style>.woff2
  file: string;
};

const FONTS: FontDef[] = [
  { family: "Inter", weight: 400, file: "latin-400-normal.woff2" },
  { family: "Inter", weight: 500, file: "latin-500-normal.woff2" },
  { family: "Inter", weight: 600, file: "latin-600-normal.woff2" },
  { family: "Cormorant Garamond", weight: 500, file: "latin-500-normal.woff2" },
  { family: "Cormorant Garamond", weight: 600, file: "latin-600-normal.woff2" },
];

function packageDir(family: string): string {
  const slug = family.toLowerCase().replace(/\s+/g, "-");
  return path.join(process.cwd(), "node_modules", "@fontsource", slug, "files");
}

let cached: string | null = null;

export async function inlineFontFaces(): Promise<string> {
  if (cached) return cached;
  const parts: string[] = [];
  for (const f of FONTS) {
    try {
      const buf = await readFile(path.join(packageDir(f.family), f.file));
      const b64 = buf.toString("base64");
      parts.push(
        `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};` +
          `font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`,
      );
    } catch (err) {
      // Fall back silently; the sheet still renders with the system serif/sans.
      console.warn(`[fonts] could not inline ${f.family} ${f.weight}:`, err instanceof Error ? err.message : err);
    }
  }
  cached = `<style data-fonts="inline">${parts.join("")}</style>`;
  return cached;
}
