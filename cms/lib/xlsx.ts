// Server-side xlsx parsing for the one-shot importers. We only need two
// shapes right now: the Inventory report and the Price Posting sheet. Both
// come as the owner's monthly xlsx exports.
import "server-only";

export type Row = Record<string, string | number | null>;

// Returns rows keyed by the *first* row that looks like a real header row
// (the one with "Item" / "item#" plus other column names). The inventory
// report has a 2-row preamble before the real headers, which this skips.
export async function parseWorksheet(fileBytes: ArrayBuffer): Promise<Row[]> {
  const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  const wb = XLSX.read(fileBytes, { type: "array", cellDates: true, cellNF: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  // sheet_to_json with header:1 gives raw arrays; we find the header row by
  // looking for one that contains both an "Item" / "item" cell and at least
  // a few more non-empty cells.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i];
    const flat = r.map((c) => String(c ?? "").trim().toLowerCase());
    if (flat.some((c) => /\bitem\s*#|item\s*number|item\b/.test(c)) && flat.filter(Boolean).length >= 3) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const headers = (rows[headerIdx] as unknown[]).map((h) =>
    String(h ?? "").trim().replace(/\s+/g, " "),
  );
  const out: Row[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    // Skip blanks + report footer rows.
    if (!Array.isArray(r) || r.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const obj: Row = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (!h) continue;
      const v = r[j];
      obj[h] = v === undefined ? null : (v as string | number | null);
    }
    out.push(obj);
  }
  return out;
}

// Case-insensitive column lookup, with some aliases that cover the known
// variants in the owner's two files.
export function pick(row: Row, ...names: string[]): string | number | null {
  const keys = Object.keys(row);
  for (const name of names) {
    const want = name.toLowerCase();
    for (const k of keys) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return null;
}
