// CSV parser (RFC 4180 lite) and wine-import planner.
// Keeping it hand-rolled rather than pulling a dependency: the catalog has
// ~100-200 wines and the CSV our Export route emits is well-behaved.
import "server-only";

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(text: string): ParsedCsv {
  // Strip UTF-8 BOM if present (Excel loves to add one).
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const body = rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = (r[j] ?? "").trim();
      }
      return obj;
    });
  return { headers, rows: body };
}

// Case-insensitive header matcher. "Producer" / "producer" / "Producer Name"
// (future) all land on the same field.
export const HEADER_ALIASES: Record<string, string[]> = {
  producer: ["producer", "producer name", "winery"],
  wine: ["wine", "display name", "name", "wine name"],
  vintage: ["vintage", "year", "vintage year"],
  category: ["category", "color", "type"],
  mevushal: ["mevushal", "cooked"],
  supervision: ["supervision", "supervising", "hechsher"],
  aging: ["aging", "aging display", "barrel aging"],
  grapes: ["grapes", "varietal", "blend", "grape blend"],
  sizes: ["sizes", "bottle sizes", "bottle size"],
  status: ["status"],
  tasting_note: ["tasting note", "tasting notes", "note"],
  food_pairing: ["food pairing", "pairing", "food"],
  short_description: ["short description", "short", "subtitle"],
  // Location columns are read for display only — we don't auto-create locations.
  country: ["country"],
  region: ["region"],
  appellation: ["appellation", "sub-region", "subregion"],
};

export function resolveHeaders(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    map[key] = null;
    for (const a of aliases) {
      const i = lower.indexOf(a);
      if (i >= 0) { map[key] = headers[i]; break; }
    }
  }
  return map;
}

export type ImportRowOutcome =
  | { line: number; status: "created"; wine_id: string; vintage_id: string }
  | { line: number; status: "updated"; wine_id: string; vintage_id: string; changed: string[] }
  | { line: number; status: "skipped"; reason: string }
  | { line: number; status: "failed"; reason: string };

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  outcomes: ImportRowOutcome[];
};

export const KNOWN_FIELDS = Object.keys(HEADER_ALIASES);
