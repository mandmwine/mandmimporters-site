import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  parent_id: string | null;
  type: "country" | "region" | "subregion" | "appellation";
  name: string;
  map_status: "needs_map" | "draft" | "approved";
  wine_count: number;
  version_count: number;
};

export default async function MapsIndex({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = (sp.q ?? "").trim();

  const where: string[] = [];
  const params: unknown[] = [];
  if (status && ["needs_map", "draft", "approved"].includes(status)) {
    params.push(status);
    where.push(`l.map_status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`lower(l.name) LIKE $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<Row>(
    `SELECT l.id, l.parent_id, l.type, l.name, l.map_status,
       (SELECT count(*)::int FROM wine_vintages v WHERE v.location_id = l.id AND v.deleted_at IS NULL) AS wine_count,
       (SELECT count(*)::int FROM map_assets m WHERE m.location_id = l.id) AS version_count
     FROM locations l
     ${whereSql}
     ORDER BY
       CASE l.type WHEN 'country' THEN 0 WHEN 'region' THEN 1 WHEN 'subregion' THEN 2 ELSE 3 END,
       l.name`,
  );

  const counts = await query<{ status: string; n: number }>(
    "SELECT map_status AS status, count(*)::int AS n FROM locations GROUP BY 1",
  );
  const totals: Record<string, number> = {};
  for (const c of counts) totals[c.status] = c.n;

  function chip(key: string, label: string) {
    const u = new URLSearchParams();
    if (key) u.set("status", key);
    if (q) u.set("q", q);
    const s = u.toString();
    return `/maps${s ? `?${s}` : ""}`;
  }

  // Group by country for easier scanning.
  const byCountry: Record<string, { country: Row | null; children: Row[] }> = {};
  const idToRow = new Map<string, Row>();
  for (const r of rows) idToRow.set(r.id, r);
  function climbToCountry(r: Row): Row | null {
    let cur: Row | null = r;
    while (cur) {
      if (cur.type === "country") return cur;
      cur = cur.parent_id ? idToRow.get(cur.parent_id) ?? null : null;
    }
    return null;
  }
  for (const r of rows) {
    const country = climbToCountry(r);
    const key = country?.name ?? "(no country)";
    if (!byCountry[key]) byCountry[key] = { country: null, children: [] };
    if (r.type === "country") byCountry[key].country = r;
    else byCountry[key].children.push(r);
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Maps</h1>
          <p className="muted">
            {totals.approved ?? 0} approved · {totals.draft ?? 0} draft ·{" "}
            {totals.needs_map ?? 0} needing a map
          </p>
        </div>
        <div className="head-actions">
          <Link className="btn primary small" href="/maps/seed">✦ Bulk seed from OpenStreetMap</Link>
        </div>
      </header>

      <form className="asset-search" action="/maps">
        {status && <input type="hidden" name="status" value={status} />}
        <input type="search" name="q" defaultValue={q} placeholder="Search location name…" />
        <button className="btn small" type="submit">Search</button>
        {q && <Link className="link small" href={chip(status, "")}>Clear</Link>}
      </form>

      <nav className="chips">
        <Link href={chip("", "all")} className={!status ? "active" : undefined}>All</Link>
        <Link href={chip("needs_map", "needs")} className={status === "needs_map" ? "active" : undefined}>
          Needs map
        </Link>
        <Link href={chip("draft", "draft")} className={status === "draft" ? "active" : undefined}>
          Draft
        </Link>
        <Link href={chip("approved", "approved")} className={status === "approved" ? "active" : undefined}>
          Approved
        </Link>
      </nav>

      <section className="maps-countries">
        {Object.entries(byCountry).sort(([a], [b]) => a.localeCompare(b)).map(([country, { country: countryRow, children }]) => (
          <div key={country} className="panel">
            <div className="panel-head">
              <h2>{country}</h2>
              {countryRow && <MapStatusBadge status={countryRow.map_status} />}
            </div>
            {countryRow && (
              <p className="muted small" style={{ marginTop: -4 }}>
                <Link href={`/maps/${countryRow.id}`}>Edit country map</Link>
                {countryRow.wine_count > 0 && (
                  <>
                    {" "}· {countryRow.wine_count} wine{countryRow.wine_count === 1 ? "" : "s"}
                  </>
                )}
              </p>
            )}
            {children.length === 0 ? (
              <p className="muted small">No subregions recorded.</p>
            ) : (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Region / appellation</th>
                    <th>Type</th>
                    <th className="right">Wines</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {children.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/maps/${r.id}`} className="strong">{r.name}</Link>
                      </td>
                      <td className="muted small">{r.type}</td>
                      <td className="right">{r.wine_count || ""}</td>
                      <td><MapStatusBadge status={r.map_status} /></td>
                      <td className="right small">
                        {r.version_count > 0
                          ? `${r.version_count} version${r.version_count === 1 ? "" : "s"}`
                          : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="muted">No locations match.</p>
        )}
      </section>
    </>
  );
}

function MapStatusBadge({ status }: { status: "needs_map" | "draft" | "approved" }) {
  const label = status === "needs_map" ? "Needs map" : status === "draft" ? "Draft" : "Approved";
  return <span className={`badge badge--${status}`}>{label}</span>;
}
