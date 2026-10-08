import Link from "next/link";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { SeverityBadge } from "@/components/Badge";
import FlagButtons from "@/components/FlagButtons";
import { ReviewBulkBar, ReviewSelectAll, ReviewSelectCheckbox } from "@/components/ReviewBulk";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  conflict: "Data conflicts",
  duplicate: "Possible duplicates",
  missing: "Missing information",
  suspicious_change: "Suspicious values",
  legacy: "Imported-copy notes",
  stale: "Stale verification",
  new_vintage: "New vintages",
  image: "Image warnings",
  map: "Map warnings",
  overflow: "Copy overflow",
  layout: "Layout warnings",
};

type Flag = {
  id: string; entity_type: string; entity_id: string; field_name: string | null; flag_type: string;
  severity: string; message: string; status: string; label: string | null;
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const type = sp.type && TYPES[sp.type] ? sp.type : "";
  const severity = ["error", "warning", "info"].includes(sp.severity ?? "") ? sp.severity! : "";
  const status = sp.status === "closed" ? "closed" : "open";
  const user = await getSessionUser();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const where = [status === "open" ? "f.status = 'open'" : "f.status <> 'open'"];
  const params: unknown[] = [];
  if (type) { params.push(type); where.push(`f.flag_type = $${params.length}`); }
  if (severity) { params.push(severity); where.push(`f.severity = $${params.length}`); }

  const counts = await query<{ flag_type: string; n: number }>(
    "SELECT flag_type, count(*)::int AS n FROM review_flags WHERE status = 'open' GROUP BY 1",
  );
  // Phase 37 (Sprint 2) — AI inbox count, shown as a tab on the review nav
  // so the editor can bounce between flagged records and AI-proposed changes.
  const aiPending = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM ai_actions WHERE status = 'proposed'",
  );
  const aiCount = aiPending[0]?.n ?? 0;
  const rows = await query<Flag>(
    `SELECT f.id, f.entity_type, f.entity_id, f.field_name, f.flag_type, f.severity, f.message, f.status,
       CASE f.entity_type
         WHEN 'wine_vintage' THEN (SELECT w.display_name || ' ' || coalesce(v.vintage_text, '(no vintage)')
                                   FROM wine_vintages v JOIN wines w ON w.id = v.wine_id WHERE v.id = f.entity_id)
         WHEN 'wine' THEN (SELECT display_name FROM wines WHERE id = f.entity_id)
         WHEN 'supervision_authority' THEN (SELECT 'Supervision: ' || canonical_name FROM supervision_authorities WHERE id = f.entity_id)
         WHEN 'critic' THEN (SELECT 'Critic: ' || canonical_name FROM critics WHERE id = f.entity_id)
         ELSE f.entity_type END AS label
     FROM review_flags f
     WHERE ${where.join(" AND ")}
     ORDER BY CASE f.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, label, f.created_at
     LIMIT 300`,
    params,
  );
  const total = counts.reduce((a, c) => a + c.n, 0);
  const qs = (o: Record<string, string>) => {
    const u = new URLSearchParams({ ...(type && { type }), ...(severity && { severity }), ...(status === "closed" && { status }), ...o });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    return `/review?${u}`;
  };

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Review queue</h1>
          <p className="muted">{total} open items. Warnings never block a catalog; they show what to check.</p>
        </div>
        <div className="head-side">
          <Link href="/review/ai" className="btn small">
            AI inbox {aiCount > 0 && <span className="pill">{aiCount}</span>}
          </Link>
        </div>
      </header>

      <nav className="chips">
        <Link href={qs({ type: "" })} className={!type ? "active" : undefined}>All</Link>
        {Object.entries(TYPES).map(([k, label]) => {
          const n = counts.find((c) => c.flag_type === k)?.n ?? 0;
          if (!n && k !== type) return null;
          return (
            <Link key={k} href={qs({ type: k })} className={type === k ? "active" : undefined}>
              {label} <span className="muted">{n}</span>
            </Link>
          );
        })}
      </nav>
      <nav className="chips sub">
        {[["", "Any severity"], ["error", "Needs fix"], ["warning", "Check"], ["info", "Notes"]].map(([k, label]) => (
          <Link key={k} href={qs({ severity: k })} className={severity === k ? "active" : undefined}>{label}</Link>
        ))}
        <span className="spacer" />
        <Link href={qs({ status: status === "open" ? "closed" : "" })}>{status === "open" ? "Show closed" : "Show open"}</Link>
      </nav>

      {canEdit && <ReviewBulkBar />}

      <table className="table">
        <thead>
          <tr>
            {canEdit && (
              <th style={{ width: 36 }}>
                <ReviewSelectAll ids={rows.map((r) => r.id)} />
              </th>
            )}
            <th style={{ width: 90 }}>Severity</th>
            <th>Issue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              {canEdit && (
                <td>
                  <ReviewSelectCheckbox id={f.id} label={f.message} />
                </td>
              )}
              <td><SeverityBadge severity={f.severity} /></td>
              <td>
                {f.entity_type === "wine_vintage" ? (
                  <Link href={`/wines/${f.entity_id}`} className="strong">{f.label}</Link>
                ) : (
                  <span className="strong">{f.label}</span>
                )}
                <div>{f.message}</div>
                <div className="muted small">
                  {f.field_name ? f.field_name.replace(/_/g, " ") + " · " : ""}
                  {(TYPES[f.flag_type] ?? f.flag_type).toLowerCase()}
                  {canEdit && <> · <FlagButtons id={f.id} status={f.status} /></>}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={canEdit ? 3 : 2} className="muted empty-state">Nothing here.</td></tr>
          )}
        </tbody>
      </table>
      {rows.length === 300 && <p className="muted small">Showing the first 300. Narrow the filters to see more.</p>}
    </>
  );
}
