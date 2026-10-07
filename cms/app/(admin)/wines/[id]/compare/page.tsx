import Link from "next/link";
import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Vintage = {
  id: string;
  wine_id: string;
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
  grapes_text: string;
  score_count: number;
  top_score: string | null;
  updated_at: Date;
};

export default async function CompareVintagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const current = await one<{ wine_id: string; display_name: string; producer: string }>(
    `SELECT v.wine_id, w.display_name, p.name AS producer
       FROM wine_vintages v JOIN wines w ON w.id = v.wine_id JOIN producers p ON p.id = w.producer_id
       WHERE v.id = $1`,
    [id],
  );
  if (!current) notFound();

  const vintages = await query<Vintage>(
    `SELECT v.id, v.wine_id, v.vintage_text, v.status, v.mevushal,
            v.supervision_display, v.aging_display, v.bottle_sizes,
            v.special_designation, v.tasting_note, v.food_pairing, v.short_description,
            v.first_kosher_vintage, v.organic, v.biodynamic, v.bottle_asset_id, v.updated_at,
       COALESCE(
         (SELECT string_agg(
           CASE WHEN wg.percentage IS NOT NULL
                THEN wg.percentage::text || '% ' || g.canonical_name
                ELSE g.canonical_name END,
           ', ' ORDER BY wg.display_order)
          FROM wine_grapes wg JOIN grapes g ON g.id = wg.grape_id
          WHERE wg.wine_vintage_id = v.id), '') AS grapes_text,
       (SELECT count(*)::int FROM wine_scores WHERE wine_vintage_id = v.id) AS score_count,
       (SELECT score_text FROM wine_scores WHERE wine_vintage_id = v.id AND is_primary
          ORDER BY numeric_score DESC NULLS LAST LIMIT 1) AS top_score
       FROM wine_vintages v
       WHERE v.wine_id = $1 AND v.deleted_at IS NULL
       ORDER BY v.vintage_text DESC NULLS LAST`,
    [current.wine_id],
  );

  const yesNo = (b: boolean | null) => (b === null ? null : b ? "Yes" : "No");
  const mevushalDisplay = (m: string) => m === "yes" ? "Yes" : m === "no" ? "No" : "—";

  const rows: {
    key: string;
    label: string;
    cell: (v: Vintage) => React.ReactNode;
    sameOkEmpty?: boolean; // treat empty as "not different"
  }[] = [
    { key: "status", label: "Status", cell: (v) => v.status.replace(/_/g, " ") },
    { key: "grapes_text", label: "Blend", cell: (v) => v.grapes_text || <span className="missing">—</span> },
    { key: "mevushal", label: "Mevushal", cell: (v) => mevushalDisplay(v.mevushal) },
    { key: "supervision_display", label: "Supervision", cell: (v) => v.supervision_display ?? <span className="missing">—</span> },
    { key: "aging_display", label: "Aging", cell: (v) => v.aging_display ?? <span className="missing">—</span> },
    { key: "special_designation", label: "Designation", cell: (v) => v.special_designation ?? <span className="missing">—</span> },
    { key: "bottle_sizes", label: "Sizes", cell: (v) => v.bottle_sizes.join(", ") || <span className="missing">—</span> },
    { key: "first_kosher_vintage", label: "First kosher", cell: (v) => yesNo(v.first_kosher_vintage) ?? "—" },
    { key: "organic", label: "Organic", cell: (v) => yesNo(v.organic) ?? "—" },
    { key: "biodynamic", label: "Biodynamic", cell: (v) => yesNo(v.biodynamic) ?? "—" },
    { key: "score_count", label: "Scores", cell: (v) => (
      <>
        {v.score_count || 0}
        {v.top_score && <span className="muted small"> · top {v.top_score}</span>}
      </>
    )},
    { key: "bottle_asset_id", label: "Bottle image", cell: (v) => v.bottle_asset_id ? "Set" : <span className="missing">—</span> },
    { key: "tasting_note", label: "Tasting note", cell: (v) => (
      v.tasting_note
        ? <span className="small">{v.tasting_note.slice(0, 240)}{v.tasting_note.length > 240 ? "…" : ""}</span>
        : <span className="missing">—</span>
    )},
    { key: "food_pairing", label: "Pairing", cell: (v) => (
      v.food_pairing ? <span className="small">{v.food_pairing}</span> : <span className="missing">—</span>
    )},
    { key: "short_description", label: "Short", cell: (v) => (
      v.short_description ? <span className="small">{v.short_description}</span> : <span className="missing">—</span>
    )},
    { key: "updated_at", label: "Updated", cell: (v) => new Date(v.updated_at).toLocaleDateString("en-US") },
  ];

  // Figure out which rows have different values across vintages so we can
  // highlight them.
  function differs(row: typeof rows[number]): boolean {
    if (vintages.length < 2) return false;
    const vals = vintages.map((v) => {
      const value = (v as unknown as Record<string, unknown>)[row.key];
      if (Array.isArray(value)) return value.join(",");
      return value === null || value === undefined ? "" : String(value);
    });
    const first = vals[0];
    return vals.some((val) => val !== first);
  }

  return (
    <>
      <nav className="crumbs">
        <Link href={`/wines/${id}`}>← Back to this vintage</Link>
      </nav>
      <header className="page-head">
        <p className="eyebrow">{current.producer}</p>
        <h1>{current.display_name} · vintage comparison</h1>
        <p className="muted">{vintages.length} vintage{vintages.length === 1 ? "" : "s"} on record</p>
      </header>

      {vintages.length < 2 ? (
        <p className="muted">
          Only one vintage recorded. Add another vintage from the wine detail page to compare them side by side.
        </p>
      ) : (
        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                {vintages.map((v) => (
                  <th key={v.id} className={v.id === id ? "compare-current" : undefined}>
                    <Link href={`/wines/${v.id}`} className="strong">
                      {v.vintage_text ?? "No vintage"}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diff = differs(r);
                return (
                  <tr key={r.key} className={diff ? "compare-row--diff" : undefined}>
                    <th scope="row">{r.label}</th>
                    {vintages.map((v) => (
                      <td key={v.id} className={v.id === id ? "compare-current" : undefined}>
                        {r.cell(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">Rows highlighted amber vary between vintages. Click a vintage header to open its editor.</p>
        </div>
      )}
    </>
  );
}
