import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { query } from "@/lib/db";
import UnarchiveButton from "@/components/UnarchiveButton";

export const dynamic = "force-dynamic";

type Row = {
  wine_id: string;
  wine_display_name: string;
  producer_name: string;
  vintage_count: number;
  archived_at: Date;
  one_vintage_id: string | null;
  one_vintage_text: string | null;
};

export default async function ArchivedWines() {
  await requireEditor();
  // Group archived wine_vintages by wine so the list isn't noisy. If a whole
  // wine is archived, every vintage carries its own deleted_at — we pick the
  // most recent as the "archived at" timestamp.
  const rows = await query<Row>(
    `SELECT w.id AS wine_id, w.display_name AS wine_display_name,
            p.name AS producer_name,
            count(v.id)::int AS vintage_count,
            max(v.deleted_at) AS archived_at,
            (array_agg(v.id ORDER BY v.deleted_at DESC))[1] AS one_vintage_id,
            (array_agg(v.vintage_text ORDER BY v.deleted_at DESC))[1] AS one_vintage_text
     FROM wines w
     JOIN producers p ON p.id = w.producer_id
     JOIN wine_vintages v ON v.wine_id = w.id AND v.deleted_at IS NOT NULL
     GROUP BY w.id, w.display_name, p.name
     ORDER BY archived_at DESC NULLS LAST`,
  );

  return (
    <>
      <p className="crumbs">
        <Link href="/wines">Wines</Link> / Archived
      </p>
      <header className="page-head">
        <h1>Archived wines</h1>
        <p className="muted">
          {rows.length === 0
            ? "Nothing archived."
            : `${rows.length} archived wine${rows.length === 1 ? "" : "s"}. Restore to bring them back to the main list and public catalog.`}
        </p>
      </header>

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Producer</th>
              <th>Wine</th>
              <th className="right">Vintages</th>
              <th>Archived</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.wine_id}>
                <td>{r.producer_name}</td>
                <td>
                  <strong>{r.wine_display_name}</strong>
                  {r.vintage_count === 1 && r.one_vintage_text && (
                    <span className="muted small"> · {r.one_vintage_text}</span>
                  )}
                </td>
                <td className="right">{r.vintage_count}</td>
                <td className="small muted">
                  {r.archived_at ? new Date(r.archived_at).toLocaleDateString("en-US") : "—"}
                </td>
                <td className="right">
                  <UnarchiveButton
                    kind={r.vintage_count === 1 ? "vintage" : "wine"}
                    id={r.vintage_count === 1 ? (r.one_vintage_id as string) : r.wine_id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
