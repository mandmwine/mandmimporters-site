import Link from "next/link";
import { query } from "@/lib/db";
import ClickableRow from "@/components/ClickableRow";
import SortableTh from "@/components/SortableTh";

export const dynamic = "force-dynamic";

const SORT: Record<string, string> = {
  name: "p.name",
  country: "coalesce(c.name, '')",
  wines: "wines",
  flags: "open_flags",
};

export default async function ProducersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const sort = sp.sort && SORT[sp.sort] ? sp.sort : "";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const orderClause = sort
    ? `${SORT[sort]} ${dir === "desc" ? "DESC" : "ASC"} NULLS LAST, p.name`
    : "p.name";

  const rows = await query<{ id: string; name: string; place: string | null; country: string | null; wines: number; open_flags: number }>(
    `SELECT p.id, p.name, l.name AS place, c.name AS country,
       (SELECT count(*)::int FROM wines w WHERE w.producer_id = p.id AND w.deleted_at IS NULL) AS wines,
       (SELECT count(*)::int FROM review_flags f JOIN wine_vintages v ON v.id = f.entity_id AND f.entity_type = 'wine_vintage'
          JOIN wines w ON w.id = v.wine_id WHERE w.producer_id = p.id AND f.status = 'open') AS open_flags
     FROM producers p
     LEFT JOIN locations l ON l.id = p.primary_location_id
     LEFT JOIN locations c ON c.id = p.country_location_id
     WHERE p.deleted_at IS NULL ORDER BY ${orderClause}`,
  );
  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Producers</h1>
          <p className="muted">{rows.length} producers. Click a name to edit the winery story, website, supervision and sources.</p>
        </div>
        <div className="head-side">
          <Link href="/producers/archived" className="link small">Archived</Link>
        </div>
      </header>
      <table className="table table-rows">
        <thead>
          <tr>
            <SortableTh label="Producer" field="name" />
            <SortableTh label="Region" field="country" />
            <SortableTh label="Wines" field="wines" className="right" />
            <SortableTh label="Open flags" field="flags" className="right" />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <ClickableRow key={p.id} href={`/producers/${p.id}`}>
              <td><Link href={`/producers/${p.id}`} className="strong">{p.name}</Link></td>
              <td>{p.place && p.place !== p.country ? `${p.place}, ` : ""}{p.country}</td>
              <td className="right">{p.wines}</td>
              <td className="right">{p.open_flags || "—"}</td>
              <td className="right small">
                <Link href={`/wines?q=${encodeURIComponent(p.name)}`} className="link">Wines →</Link>
              </td>
            </ClickableRow>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="muted empty-state">No producers yet.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
