import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProducersPage() {
  const rows = await query<{ id: string; name: string; place: string | null; country: string | null; wines: number; open_flags: number }>(
    `SELECT p.id, p.name, l.name AS place, c.name AS country,
       (SELECT count(*)::int FROM wines w WHERE w.producer_id = p.id AND w.deleted_at IS NULL) AS wines,
       (SELECT count(*)::int FROM review_flags f JOIN wine_vintages v ON v.id = f.entity_id AND f.entity_type = 'wine_vintage'
          JOIN wines w ON w.id = v.wine_id WHERE w.producer_id = p.id AND f.status = 'open') AS open_flags
     FROM producers p
     LEFT JOIN locations l ON l.id = p.primary_location_id
     LEFT JOIN locations c ON c.id = p.country_location_id
     WHERE p.deleted_at IS NULL ORDER BY p.name`,
  );
  return (
    <>
      <header className="page-head">
        <h1>Producers</h1>
        <p className="muted">{rows.length} producers. Click a name to edit the winery story, website, supervision and sources.</p>
      </header>
      <table className="table">
        <thead>
          <tr>
            <th>Producer</th>
            <th>Region</th>
            <th className="right">Wines</th>
            <th className="right">Open flags</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/producers/${p.id}`} className="strong">{p.name}</Link></td>
              <td>{p.place && p.place !== p.country ? `${p.place}, ` : ""}{p.country}</td>
              <td className="right">{p.wines}</td>
              <td className="right">{p.open_flags || "—"}</td>
              <td className="right small">
                <Link href={`/wines?q=${encodeURIComponent(p.name)}`} className="link">Wines →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
