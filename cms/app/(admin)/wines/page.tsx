import Link from "next/link";
import { query } from "@/lib/db";
import { StatusBadge } from "@/components/Badge";
import WineRowSelect, { SelectAllCheckbox } from "@/components/WineRowSelect";
import ClickableRow from "@/components/ClickableRow";
import LiveFilters from "@/components/LiveFilters";
import SortableTh from "@/components/SortableTh";
import PerPageChooser from "@/components/PerPageChooser";
import FilterChips, { type Chip } from "@/components/FilterChips";
import SavedViews from "@/components/SavedViews";
import { loadSavedViews } from "@/lib/savedViews";
import JumpToPage from "@/components/JumpToPage";
import ListKeyboardNav from "@/components/ListKeyboardNav";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE = 50;
const ALLOWED_PER = new Set([25, 50, 100, 200]);
const MISSING: Record<string, string> = {
  vintage: "v.vintage_text IS NULL",
  mevushal: "v.mevushal = 'unknown'",
  supervision: "coalesce(v.supervision_display, '') = ''",
  tasting: "coalesce(v.tasting_note, '') = ''",
  scores: "NOT EXISTS (SELECT 1 FROM wine_scores s WHERE s.wine_vintage_id = v.id)",
  bottle: "v.bottle_asset_id IS NULL",
};

const MISSING_LABEL: Record<string, string> = {
  vintage: "Missing vintage",
  mevushal: "Missing mevushal",
  supervision: "Missing supervision",
  tasting: "Missing tasting note",
  scores: "No scores",
  bottle: "Missing bottle image",
};

// Sort key → SQL. Whitelisted so a crafted URL can't inject SQL.
const SORT_BY: Record<string, string> = {
  wine: "w.display_name",
  producer: "p.name",
  vintage: "v.vintage_text",
  status: "v.status",
  flags: "flags",
  updated: "v.updated_at",
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
  const perRaw = parseInt(sp.per ?? "", 10);
  const per = ALLOWED_PER.has(perRaw) ? perRaw : DEFAULT_PAGE;
  const sort = sp.sort && SORT_BY[sp.sort] ? sp.sort : "";
  const dir = sp.dir === "desc" ? "desc" : "asc";

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

  // Order clause: sorted column (if any) first, then stable tiebreakers so
  // pagination doesn't shuffle equal rows between pages.
  const orderPrimary = sort
    ? `${SORT_BY[sort]} ${dir === "desc" ? "DESC" : "ASC"} NULLS LAST`
    : "p.name, w.display_name, v.vintage_text DESC NULLS LAST";
  const orderClause = sort
    ? `${orderPrimary}, p.name, w.display_name, v.id`
    : orderPrimary;

  const rows = await query<Row>(
    `SELECT v.id AS vintage_id, w.id AS wine_id, w.display_name, p.name AS producer, v.vintage_text, v.status,
            l.name AS place, c.name AS country, w.category,
            (SELECT count(*)::int FROM review_flags f WHERE f.entity_type = 'wine_vintage' AND f.entity_id = v.id AND f.status = 'open') AS flags
     ${base}
     ORDER BY ${orderClause}
     LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params,
  );
  const countries = await query<{ name: string }>("SELECT name FROM locations WHERE type = 'country' ORDER BY name");
  const savedViews = await loadSavedViews("wines");
  const pages = Math.max(1, Math.ceil(total / per));
  const link = (p: number) => {
    const u = new URLSearchParams({
      ...(q && { q }), ...(status && { status }), ...(country && { country }), ...(missing && { missing }),
      ...(sort && { sort }), ...(sort && dir && { dir }), ...(per !== DEFAULT_PAGE && { per: String(per) }),
      page: String(p),
    });
    return `/wines?${u}`;
  };

  // Chips for every active filter so the user can see and remove them.
  const chips: Chip[] = [];
  if (q) chips.push({ key: "q", value: q, label: `“${q}”` });
  if (status) chips.push({ key: "status", value: status, label: `Status: ${status.replace(/_/g, " ")}` });
  if (country) chips.push({ key: "country", value: country, label: country });
  if (missing) chips.push({ key: "missing", value: missing, label: MISSING_LABEL[missing] ?? missing });

  const entries = rows.map((r) => ({
    id: r.vintage_id,
    label: `${r.display_name}${r.vintage_text ? ` ${r.vintage_text}` : ""}`,
    producer: r.producer,
  }));
  const anyFilter = Boolean(q || status || country || missing);

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Wines</h1>
          <p className="muted">
            {total} vintage record{total === 1 ? "" : "s"}
            {anyFilter && " · filtered"}
            {" · showing "}{rows.length ? `${(page - 1) * per + 1}–${(page - 1) * per + rows.length}` : "0"}
          </p>
        </div>
        <div className="head-side">
          <PerPageChooser current={per} />
        </div>
      </header>

      <SavedViews scope="wines" views={savedViews} anyFilter={anyFilter} />

      <LiveFilters
        basePath="/catalog-admin/wines"
        q={q}
        status={status}
        country={country}
        missing={missing}
        countries={countries}
        statuses={[
          ["draft", "Draft"],
          ["needs_review", "Needs review"],
          ["approved", "Approved"],
          ["published", "Published"],
          ["discontinued", "Discontinued"],
        ]}
        missings={[
          ["vintage", "Missing vintage"],
          ["mevushal", "Missing mevushal"],
          ["supervision", "Missing supervision"],
          ["tasting", "Missing tasting note"],
          ["scores", "No scores"],
          ["bottle", "Missing bottle image"],
        ]}
      />

      <FilterChips chips={chips} />

      <table className="table table-rows">
        <thead>
          <tr>
            <th style={{ width: 44 }}>
              <SelectAllCheckbox entries={entries} idPrefix="wines" />
            </th>
            <SortableTh label="Wine" field="wine" />
            <SortableTh label="Vintage" field="vintage" />
            <th>Appellation / region</th>
            <SortableTh label="Status" field="status" />
            <SortableTh label="Open flags" field="flags" className="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <ClickableRow key={r.vintage_id} href={`/wines/${r.vintage_id}`}>
              <td>
                <WineRowSelect
                  id={r.vintage_id}
                  label={`${r.display_name}${r.vintage_text ? ` ${r.vintage_text}` : ""}`}
                  producer={r.producer}
                  index={idx}
                  entries={entries}
                />
              </td>
              <td>
                <Link href={`/wines/${r.vintage_id}`} className="strong">{r.display_name}</Link>
                <div className="muted small">
                  <Link
                    href={`/wines?q=${encodeURIComponent(r.producer)}`}
                    className="link"
                    title="Filter wines by this producer"
                  >
                    {r.producer}
                  </Link>
                  {r.category ? ` · ${r.category}` : ""}
                </div>
              </td>
              <td>{r.vintage_text ?? <span className="missing">none</span>}</td>
              <td>
                {r.place}
                {r.country && r.country !== r.place ? <span className="muted">, {r.country}</span> : null}
              </td>
              <td><StatusBadge status={r.status} /></td>
              <td className="right">{r.flags > 0 ? <span className="pill">{r.flags}</span> : "—"}</td>
            </ClickableRow>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="muted empty-state">
              No wines match these filters.
              {anyFilter && <> <Link href="/wines">Clear filters</Link></>}
            </td></tr>
          )}
        </tbody>
      </table>

      {pages > 1 && (
        <nav className="pager">
          {page > 1 ? <Link href={link(1)}>« First</Link> : <span className="muted">« First</span>}
          {page > 1 ? <Link href={link(page - 1)}>← Previous</Link> : <span className="muted">← Previous</span>}
          <span className="muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)}>Next →</Link> : <span className="muted">Next →</span>}
          {page < pages ? <Link href={link(pages)}>Last »</Link> : <span className="muted">Last »</span>}
          <JumpToPage pages={pages} />
        </nav>
      )}

      <ListKeyboardNav rowSelector="tbody tr.row-clickable" />
    </>
  );
}
