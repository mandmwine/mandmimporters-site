import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { query } from "@/lib/db";
import UnarchiveButton from "@/components/UnarchiveButton";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  deleted_at: Date;
  wine_count: number;
};

export default async function ArchivedProducers() {
  await requireEditor();
  const rows = await query<Row>(
    `SELECT p.id, p.name, p.deleted_at,
            (SELECT count(*)::int FROM wines w WHERE w.producer_id = p.id) AS wine_count
     FROM producers p
     WHERE p.deleted_at IS NOT NULL
     ORDER BY p.deleted_at DESC`,
  );
  return (
    <>
      <p className="crumbs">
        <Link href="/producers">Producers</Link> / Archived
      </p>
      <header className="page-head">
        <h1>Archived producers</h1>
        <p className="muted">
          {rows.length === 0
            ? "Nothing archived."
            : `${rows.length} archived. Restoring a producer also restores every wine and vintage that was archived with it.`}
        </p>
      </header>

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Producer</th>
              <th className="right">Wines</th>
              <th>Archived</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td>
                <td className="right">{r.wine_count}</td>
                <td className="small muted">
                  {new Date(r.deleted_at).toLocaleDateString("en-US")}
                </td>
                <td className="right">
                  <UnarchiveButton kind="producer" id={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
