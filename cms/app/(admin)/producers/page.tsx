// Phase 40 (Sprint 3) — Producer list with search + filters (decisions §1).
//
// The old table was unsorted/unfiltered — fine for 40 producers, not for
// 108+. This adds:
//   - Free-text search over name and short_name
//   - Country filter from the current data (not every country in the world)
//   - Needs-review filter (producer has at least one open flag on any of
//     its wines, OR missing story AND missing logo)
//   - Missing-logo quick filter
//   - Missing-story quick filter
//
// URL state only (no localStorage) so a link is shareable and the server
// can render the right subset directly. Admins also see a "+ New producer"
// button when the create path lands later.
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

type Row = {
  id: string;
  name: string;
  place: string | null;
  country: string | null;
  wines: number;
  open_flags: number;
  has_logo: boolean;
  has_story: boolean;
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

  const q = (sp.q ?? "").trim();
  const country = (sp.country ?? "").trim();
  const needsReview = sp.needs_review === "1";
  const missingLogo = sp.missing_logo === "1";
  const missingStory = sp.missing_story === "1";

  const where: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(p.name) LIKE $${params.length} OR lower(coalesce(p.short_name, '')) LIKE $${params.length})`);
  }
  if (country) {
    params.push(country);
    where.push(`c.name = $${params.length}`);
  }
  if (missingLogo) where.push("p.logo_asset_id IS NULL");
  if (missingStory) where.push("coalesce(p.winery_summary_short, '') = ''");

  const rows = await query<Row>(
    `SELECT p.id, p.name, l.name AS place, c.name AS country,
       (p.logo_asset_id IS NOT NULL) AS has_logo,
       (coalesce(p.winery_summary_short, '') <> '') AS has_story,
       (SELECT count(*)::int FROM wines w WHERE w.producer_id = p.id AND w.deleted_at IS NULL) AS wines,
       (SELECT count(*)::int FROM review_flags f JOIN wine_vintages v ON v.id = f.entity_id AND f.entity_type = 'wine_vintage'
          JOIN wines w ON w.id = v.wine_id WHERE w.producer_id = p.id AND f.status = 'open') AS open_flags
     FROM producers p
     LEFT JOIN locations l ON l.id = p.primary_location_id
     LEFT JOIN locations c ON c.id = p.country_location_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${orderClause}`,
    params,
  );

  const filtered = needsReview ? rows.filter((r) => r.open_flags > 0 || !r.has_logo || !r.has_story) : rows;

  const countries = await query<{ country: string | null }>(
    `SELECT DISTINCT c.name AS country
       FROM producers p LEFT JOIN locations c ON c.id = p.country_location_id
       WHERE p.deleted_at IS NULL AND c.name IS NOT NULL
       ORDER BY c.name`,
  );

  // Reusable param-set for the chip links.
  function qs(overrides: Record<string, string | null>): string {
    const u = new URLSearchParams();
    const current: Record<string, string> = {
      ...(q ? { q } : {}),
      ...(country ? { country } : {}),
      ...(needsReview ? { needs_review: "1" } : {}),
      ...(missingLogo ? { missing_logo: "1" } : {}),
      ...(missingStory ? { missing_story: "1" } : {}),
    };
    const merged = { ...current, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v === null || v === "" || v === undefined) continue;
      u.set(k, v);
    }
    const s = u.toString();
    return s ? `/producers?${s}` : "/producers";
  }

  const anyFilter = Boolean(q || country || needsReview || missingLogo || missingStory);

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Producers</h1>
          <p className="muted">
            {filtered.length} of {rows.length} producers
            {anyFilter && ". "}
            {anyFilter && <Link href="/producers" className="link small">Clear filters</Link>}
          </p>
        </div>
        <div className="head-side">
          <Link href="/producers/archived" className="link small">Archived</Link>
        </div>
      </header>

      <form className="filters-row" method="get" action="/producers">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search producer name…"
          aria-label="Search producers"
        />
        <select name="country" defaultValue={country} aria-label="Filter by country">
          <option value="">Any country</option>
          {countries.map((c) => (
            <option key={c.country ?? ""} value={c.country ?? ""}>
              {c.country}
            </option>
          ))}
        </select>
        <button className="btn small" type="submit">Apply</button>
      </form>

      <nav className="chips sub">
        <Link href={qs({ missing_logo: missingLogo ? null : "1" })} className={missingLogo ? "active" : undefined}>
          Missing logo
        </Link>
        <Link href={qs({ missing_story: missingStory ? null : "1" })} className={missingStory ? "active" : undefined}>
          Missing story
        </Link>
        <Link href={qs({ needs_review: needsReview ? null : "1" })} className={needsReview ? "active" : undefined}>
          Needs review
        </Link>
      </nav>

      <table className="table table-rows">
        <thead>
          <tr>
            <SortableTh label="Producer" field="name" />
            <SortableTh label="Region" field="country" />
            <SortableTh label="Wines" field="wines" className="right" />
            <SortableTh label="Open flags" field="flags" className="right" />
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <ClickableRow key={p.id} href={`/producers/${p.id}`}>
              <td><Link href={`/producers/${p.id}`} className="strong">{p.name}</Link></td>
              <td>{p.place && p.place !== p.country ? `${p.place}, ` : ""}{p.country}</td>
              <td className="right">{p.wines}</td>
              <td className="right">{p.open_flags || "—"}</td>
              <td className="small muted">
                {!p.has_logo && <span className="warn-text">no logo</span>}
                {!p.has_logo && !p.has_story && <> · </>}
                {!p.has_story && <span className="warn-text">no story</span>}
                {p.has_logo && p.has_story && <>&mdash;</>}
              </td>
              <td className="right small">
                <Link href={`/wines?q=${encodeURIComponent(p.name)}`} className="link">Wines →</Link>
              </td>
            </ClickableRow>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="muted empty-state">
              {anyFilter ? <>No producers match these filters. <Link href="/producers">Clear filters</Link></> : <>No producers yet.</>}
            </td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
