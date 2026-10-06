import Link from "next/link";
import { query } from "@/lib/db";
import { StatusBadge } from "@/components/Badge";
import WineRowSelect, { SelectAllButton } from "@/components/WineRowSelect";

export const dynamic = "force-dynamic";

const PAGE = 50;
const MISSING: Record<string, string> = {
  vintage: "v.vintage_text IS NULL",
  mevushal: "v.mevushal = 'unknown'",
  supervision: "coalesce(v.supervision_display, '') = ''",
  tasting: "coalesce(v.tasting_note, '') = ''",
  scores: "NOT EXISTS (SELECT 1 FROM wine_scores s WHERE s.wine_vintage_id = v.id)",
};

type Row = {
  vintage_id: string; wine_id: string; display_name: string; producer: string; vintage_text: string | null;
  status: string; place: string | null; country: string | null; category: string | null; flags: number;
};

export default async function WinesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const country = sp.country ?? "";
  const missing = sp.missing && MISSING[sp.missing] ? sp.missing : "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where = ["v.deleted_at IS NULL", "w.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(w.display_name ILIKE $${params.length} OR p.name ILIKE $${params.length} OR l.name ILIKE $${params.length} OR v.vintage_text ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`v.status = $${params.length}`);
  }
  if (country) {
    params.push(country);
    where.push(`c.name = $${params.length}`);
  }
  if (missing) where.push(MISSING[missing]);

  const base = `
    FROM wine_vintages v
    JOIN wines w ON w.id = v.wine_id
    JOIN producers p ON p.id = w.producer_id
    LEFT JOIN locations l ON l.id = v.location_id
    LEFT JOIN LATERAL (
      WITH RECURSIVE up AS (
        SELECT id, parent_id, type, name FROM locations WHERE id = v.location_id
        UNION ALL SELECT x.id, x.parent_id, x.type, x.name FROM locations x JOIN up ON x.id = up.parent_id
      ) SELECT name FROM up WHERE type = 'country' LIMIT 1
    ) c ON true
    WHERE ${where.join(" AND ")}`;

  const [{ total }] = await query<{ total: number }>(`SELECT count(*)::int AS total ${base}`, params);
  const rows = await query<Row>(
    `SELECT v.id AS vintage_id, w.id AS wine_id, w.display_name, p.name AS producer, v.vintage_text, v.status,
            l.name AS place, c.name AS country, w.category,
            (SELECT count(*)::int FROM review_flags f WHERE f.entity_type = 'wine_vintage' AND f.entity_id = v.id AND f.status = 'open') AS flags
     ${base}
     ORDER BY p.name, w.display_name, v.vintage_text DESC NULLS LAST
     LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    params,
  );
  const countries = await query<{ name: string }>("SELECT name FROM locations WHERE type = 'country' ORDER BY name");
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => {
    const u = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(country && { country }), ...(missing && { missing }), page: String(p) });
    return `/wines?${u}`;
  };

  return (
    <>
      <header className="page-head">
        <h1>Wines</h1>
        <p className="muted">{total} vintage records</p>
      </header>

      <form className="filters" action="/catalog-admin/wines">
        <input name="q" placeholder="Search wine, producer, appellation, vintage" defaultValue={q} />
        <select name="status" defaultValue={status}>
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="needs_review">Needs review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="discontinued">Discontinued</option>
        </select>
        <select name="country" defaultValue={country}>
          <option value="">Any country</option>
          {countries.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
        <select name="missing" defaultValue={missing}>
          <option value="">Any completeness</option>
          <option value="vintage">Missing vintage</option>
          <option value="mevushal">Missing mevushal</option>
          <option value="supervision">Missing supervision</option>
          <option value="tasting">Missing tasting note</option>
          <option value="scores">No scores</option>
        </select>
        <button className="btn">Filter</button>
        {(q || status || country || missing) && <Link href="/wines" className="link">Clear</Link>}
      </form>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 44 }}>
              <SelectAllButton
                entries={rows.map((r) => ({
                  id: r.vintage_id,
                  label: `${r.display_name}${r.vintage_text ? ` ${r.vintage_text}` : ""}`,
                  producer: r.producer,
                }))}
              />
            </th>
            <th>Wine</th>
            <th>Vintage</th>
            <th>Appellation / region</th>
            <th>Status</th>
            <th className="right">Open flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.vintage_id}>
              <td>
                <WineRowSelect
                  id={r.vintage_id}
                  label={`${r.display_name}${r.vintage_text ? ` ${r.vintage_text}` : ""}`}
                  producer={r.producer}
                />
              </td>
              <td>
                <Link href={`/wines/${r.vintage_id}`} className="strong">{r.display_name}</Link>
                <div className="muted small">{r.producer}{r.category ? ` · ${r.category}` : ""}</div>
              </td>
              <td>{r.vintage_text ?? <span className="missing">none</span>}</td>
              <td>
                {r.place}
                {r.country && r.country !== r.place ? <span className="muted">, {r.country}</span> : null}
              </td>
              <td><StatusBadge status={r.status} /></td>
              <td className="right">{r.flags > 0 ? <span className="pill">{r.flags}</span> : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="muted">No wines match these filters.</td></tr>
          )}
        </tbody>
      </table>

      {pages > 1 && (
        <nav className="pager">
          {page > 1 && <Link href={link(page - 1)}>← Previous</Link>}
          <span className="muted">Page {page} of {pages}</span>
          {page < pages && <Link href={link(page + 1)}>Next →</Link>}
        </nav>
      )}
    </>
  );
}
