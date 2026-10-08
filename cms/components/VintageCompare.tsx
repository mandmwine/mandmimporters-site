"use client";
// Phase 32 — Previous-vintage comparison, now with:
//   - A "Hide identical rows" toggle so the table collapses to the delta,
//     which is what you usually want to see year-over-year.
//   - Bottle thumbnails per vintage, so a label change is visible at a
//     glance instead of hidden behind the words "Set" / "—".
//
// The server page passes serializable rows for every vintage; this
// component does only presentation + filter state. No data mutation.
import Link from "next/link";
import { useState } from "react";

export type CompareVintage = {
  id: string;
  vintage_text: string | null;
  status: string;
  mevushal: "yes" | "no" | "unknown";
  supervision_display: string | null;
  aging_display: string | null;
  bottle_sizes: string[];
  special_designation: string | null;
  tasting_note: string | null;
  food_pairing: string | null;
  short_description: string | null;
  first_kosher_vintage: boolean | null;
  organic: boolean | null;
  biodynamic: boolean | null;
  bottle_asset_id: string | null;
  // Phase 32 — pulled through so the compare table can render a thumbnail,
  // not just a word, for the Bottle row.
  bottle_thumb_url: string | null;
  grapes_text: string;
  score_count: number;
  top_score: string | null;
  updated_at: string;
};

type Row = {
  key: string;
  label: string;
  cell: (v: CompareVintage) => React.ReactNode;
  value: (v: CompareVintage) => string;
};

export default function VintageCompare({
  currentId,
  vintages,
}: {
  currentId: string;
  vintages: CompareVintage[];
}) {
  const [hideSame, setHideSame] = useState(true);

  const yesNo = (b: boolean | null) => (b === null ? null : b ? "Yes" : "No");
  const mevushalDisplay = (m: string) => (m === "yes" ? "Yes" : m === "no" ? "No" : "—");

  const rows: Row[] = [
    { key: "status",         label: "Status",       cell: (v) => v.status.replace(/_/g, " "), value: (v) => v.status },
    { key: "grapes_text",    label: "Blend",        cell: (v) => v.grapes_text || <span className="missing">—</span>, value: (v) => v.grapes_text },
    { key: "mevushal",       label: "Mevushal",     cell: (v) => mevushalDisplay(v.mevushal), value: (v) => v.mevushal },
    { key: "supervision_display", label: "Supervision", cell: (v) => v.supervision_display ?? <span className="missing">—</span>, value: (v) => v.supervision_display ?? "" },
    { key: "aging_display",  label: "Aging",        cell: (v) => v.aging_display ?? <span className="missing">—</span>, value: (v) => v.aging_display ?? "" },
    { key: "special_designation", label: "Designation", cell: (v) => v.special_designation ?? <span className="missing">—</span>, value: (v) => v.special_designation ?? "" },
    { key: "bottle_sizes",   label: "Sizes",        cell: (v) => v.bottle_sizes.join(", ") || <span className="missing">—</span>, value: (v) => v.bottle_sizes.join(",") },
    { key: "first_kosher_vintage", label: "First kosher", cell: (v) => yesNo(v.first_kosher_vintage) ?? "—", value: (v) => String(v.first_kosher_vintage ?? "") },
    { key: "organic",        label: "Organic",      cell: (v) => yesNo(v.organic) ?? "—",     value: (v) => String(v.organic ?? "") },
    { key: "biodynamic",     label: "Biodynamic",   cell: (v) => yesNo(v.biodynamic) ?? "—", value: (v) => String(v.biodynamic ?? "") },
    {
      key: "score_count",
      label: "Scores",
      cell: (v) => (
        <>
          {v.score_count || 0}
          {v.top_score && <span className="muted small"> · top {v.top_score}</span>}
        </>
      ),
      value: (v) => `${v.score_count}|${v.top_score ?? ""}`,
    },
    {
      key: "bottle",
      label: "Bottle",
      cell: (v) =>
        v.bottle_thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="compare-bottle" src={v.bottle_thumb_url} alt={`${v.vintage_text ?? ""} bottle`} />
        ) : v.bottle_asset_id ? (
          <span className="small muted">Uploaded</span>
        ) : (
          <span className="missing">—</span>
        ),
      // Treat "has an image" as the value for same/diff purposes — pixel-level
      // equivalence isn't worth checking in the UI.
      value: (v) => (v.bottle_asset_id ? "set" : "none"),
    },
    {
      key: "tasting_note",
      label: "Tasting note",
      cell: (v) =>
        v.tasting_note ? (
          <span className="small">{v.tasting_note.slice(0, 240)}{v.tasting_note.length > 240 ? "…" : ""}</span>
        ) : (
          <span className="missing">—</span>
        ),
      value: (v) => v.tasting_note ?? "",
    },
    {
      key: "food_pairing",
      label: "Pairing",
      cell: (v) => (v.food_pairing ? <span className="small">{v.food_pairing}</span> : <span className="missing">—</span>),
      value: (v) => v.food_pairing ?? "",
    },
    {
      key: "short_description",
      label: "Short",
      cell: (v) => (v.short_description ? <span className="small">{v.short_description}</span> : <span className="missing">—</span>),
      value: (v) => v.short_description ?? "",
    },
    {
      key: "updated_at",
      label: "Updated",
      cell: (v) => new Date(v.updated_at).toLocaleDateString("en-US"),
      value: (v) => v.updated_at,
    },
  ];

  function differs(r: Row): boolean {
    if (vintages.length < 2) return false;
    const vals = vintages.map((v) => r.value(v));
    const first = vals[0];
    return vals.some((val) => val !== first);
  }

  const visibleRows = hideSame ? rows.filter(differs) : rows;
  const diffCount = rows.filter(differs).length;

  if (vintages.length < 2) {
    return (
      <p className="muted">
        Only one vintage recorded. Add another vintage from the wine detail page to compare them side by side.
      </p>
    );
  }

  return (
    <div className="compare-wrap">
      <div className="compare-toolbar">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={hideSame}
            onChange={(e) => setHideSame(e.target.checked)}
          />
          Hide rows where every vintage matches
        </label>
        <span className="small muted">
          {diffCount === 0
            ? "Every row matches across vintages."
            : `${diffCount} row${diffCount === 1 ? "" : "s"} differ${diffCount === 1 ? "s" : ""}.`}
        </span>
      </div>

      <table className="compare-table">
        <thead>
          <tr>
            <th />
            {vintages.map((v) => (
              <th key={v.id} className={v.id === currentId ? "compare-current" : undefined}>
                <Link href={`/wines/${v.id}`} className="strong">
                  {v.vintage_text ?? "No vintage"}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={vintages.length + 1} className="small muted" style={{ padding: 20, textAlign: "center" }}>
                Nothing to show &mdash; every row matches across every vintage.{" "}
                <button type="button" className="link" onClick={() => setHideSame(false)}>
                  Show all rows
                </button>
              </td>
            </tr>
          ) : (
            visibleRows.map((r) => {
              const diff = differs(r);
              return (
                <tr key={r.key} className={diff ? "compare-row--diff" : undefined}>
                  <th scope="row">{r.label}</th>
                  {vintages.map((v) => (
                    <td key={v.id} className={v.id === currentId ? "compare-current" : undefined}>
                      {r.cell(v)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <p className="small muted">
        Rows highlighted amber vary between vintages. Click a vintage header to open its editor.
      </p>
    </div>
  );
}
