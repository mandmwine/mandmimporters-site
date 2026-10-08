// Phase 34 (Sprint 1) — System / errors page.
//
// Shows the aggregate state of the system — latest health check per
// service, counts of recent errors by kind, and the twenty most recent
// errors with their route and context — so an admin can see "is anything
// red" without opening Vercel. Reads only; doesn't trigger probes.
// Admin-only.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { query, dbConfigured } from "@/lib/db";
import { getLatestHealthByService } from "@/lib/health/environment";

export const dynamic = "force-dynamic";

type ErrorRow = {
  id: string;
  kind: string;
  route: string | null;
  message: string;
  user_email: string | null;
  context: Record<string, unknown>;
  occurred_at: Date;
};

type KindCountRow = {
  kind: string;
  n: number;
};

export default async function SystemPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") notFound();

  const latest = dbConfigured() ? await getLatestHealthByService() : {};
  const [kindCounts24h, recentErrors] = dbConfigured()
    ? await Promise.all([
        query<KindCountRow>(
          `SELECT kind, count(*)::int AS n
             FROM system_errors
            WHERE occurred_at > now() - interval '24 hours'
            GROUP BY kind
            ORDER BY n DESC`,
        ),
        query<ErrorRow>(
          `SELECT e.id, e.kind, e.route, e.message, e.context, e.occurred_at,
                  u.email AS user_email
             FROM system_errors e
             LEFT JOIN users u ON u.id = e.user_id
            ORDER BY e.occurred_at DESC
            LIMIT 20`,
        ),
      ])
    : [[], []];

  const total24h = kindCounts24h.reduce((a, r) => a + r.n, 0);
  const anyDegraded = Object.values(latest).some((r) => r.status !== "ok" && r.status !== "missing");
  const topLineStatus =
    total24h > 0 || anyDegraded ? "warn" : Object.keys(latest).length > 0 ? "ok" : "mute";

  return (
    <>
      <header className="page-head">
        <h1>System</h1>
        <p className="muted">
          A one-page roll-up: last-known status for each probed service,
          error counts for the last 24 hours, and the twenty most recent
          captured errors. For a fresh probe run, use{" "}
          <Link href="/settings/environment">Environment</Link>.
        </p>
      </header>

      <div className={`panel env-panel env-row--${topLineStatus === "ok" ? "ok" : topLineStatus === "warn" ? "degraded" : "mute"}`} style={{ borderLeftWidth: 3, borderLeftStyle: "solid" }}>
        <h2>Overall</h2>
        <p className="small">
          {total24h === 0 && !anyDegraded && Object.keys(latest).length > 0 && (
            <>No captured errors in the last 24 hours. All probed services green.</>
          )}
          {total24h > 0 && (
            <>
              <strong>{total24h}</strong> captured error{total24h === 1 ? "" : "s"} in the last 24 hours.{" "}
            </>
          )}
          {anyDegraded && <>At least one service is reporting degraded or failed.</>}
          {Object.keys(latest).length === 0 && (
            <span className="muted">
              No health checks have run yet &mdash; open <Link href="/settings/environment">Environment</Link> and click <em>Run checks again</em>.
            </span>
          )}
        </p>
      </div>

      <div className="panel">
        <h2>Service health</h2>
        {Object.keys(latest).length === 0 ? (
          <p className="muted small">No probes recorded.</p>
        ) : (
          <ul className="env-list">
            {Object.values(latest)
              .sort((a, b) => a.service.localeCompare(b.service))
              .map((r) => (
                <li key={r.service} className={`env-row env-row--${r.status}`}>
                  <strong>{r.service}</strong>
                  <span className="env-row__status">
                    {r.status}
                    {r.latency_ms !== null && <span className="muted small"> &middot; {r.latency_ms} ms</span>}
                    <span className="muted small"> &middot; {new Date(r.checked_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</span>
                  </span>
                  {r.message && <p className="small muted env-row__msg">{r.message}</p>}
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2>Captured errors — last 24 hours</h2>
        {kindCounts24h.length === 0 ? (
          <p className="muted small">None.</p>
        ) : (
          <ul className="env-list">
            {kindCounts24h.map((r) => (
              <li key={r.kind} className="env-row env-row--warn">
                <strong>{r.kind}</strong>
                <span className="env-row__status">
                  {r.n} error{r.n === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2>Most recent 20 errors</h2>
        {recentErrors.length === 0 ? (
          <p className="muted small">No captured errors.</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Where</th>
                <th>Message</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              {recentErrors.map((e) => (
                <tr key={e.id}>
                  <td className="small muted">{new Date(e.occurred_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
                  <td className="small">{e.kind}</td>
                  <td className="small"><code>{e.route ?? "—"}</code></td>
                  <td className="small">{e.message}</td>
                  <td className="small muted">{e.user_email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
