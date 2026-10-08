// Phase 33 (Sprint 1) — Backups status page.
//
// Reads from backup_runs. The actual nightly pg_dump cron isn't wired up
// in this phase (it needs a BACKUP_BUCKET and service-account access to
// GCS, both operational). This page is useful today because:
//
//   - It shows that Cloud SQL's managed backups aren't the only thing
//     looked at (the operator can see when an independent dump last
//     landed, and the restore-test timestamp)
//   - It's the destination the pg_dump cron will insert into when it
//     ships, so there's no later page to build.
//
// Admin-only.
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { query, dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type BackupRow = {
  id: string;
  backup_type: "pg_dump" | "restore_test";
  status: "running" | "succeeded" | "failed";
  object_path: string | null;
  bytes: string | null;      // bigint -> text via pg type parser
  started_at: Date;
  completed_at: Date | null;
  error_message: string | null;
};

function human(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function BackupsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") notFound();

  const latestDump = dbConfigured()
    ? await query<BackupRow>(
        `SELECT id, backup_type, status, object_path, bytes::text AS bytes,
                started_at, completed_at, error_message
           FROM backup_runs
           WHERE backup_type = 'pg_dump'
           ORDER BY started_at DESC
           LIMIT 1`,
      )
    : [];
  const latestRestore = dbConfigured()
    ? await query<BackupRow>(
        `SELECT id, backup_type, status, object_path, bytes::text AS bytes,
                started_at, completed_at, error_message
           FROM backup_runs
           WHERE backup_type = 'restore_test'
           ORDER BY started_at DESC
           LIMIT 1`,
      )
    : [];
  const recent = dbConfigured()
    ? await query<BackupRow>(
        `SELECT id, backup_type, status, object_path, bytes::text AS bytes,
                started_at, completed_at, error_message
           FROM backup_runs
           ORDER BY started_at DESC
           LIMIT 20`,
      )
    : [];

  const bucketConfigured = Boolean(process.env.BACKUP_BUCKET);

  return (
    <>
      <header className="page-head">
        <h1>Backups</h1>
        <p className="muted">
          Independent nightly export to GCS alongside Cloud SQL&rsquo;s managed
          backups. The pg_dump cron and the quarterly restore drill both
          write rows into <code>backup_runs</code>; this page reports what
          they found.
        </p>
      </header>

      <div className="panel">
        <h2>Current state</h2>
        <dl className="specs">
          <div>
            <dt>GCS bucket configured</dt>
            <dd>{bucketConfigured ? <span className="ok-text">Yes</span> : <span className="warn-text">No — set BACKUP_BUCKET in Vercel</span>}</dd>
          </div>
          <div>
            <dt>Last independent pg_dump</dt>
            <dd>{latestDump[0]
              ? (<>
                  <strong>{latestDump[0].status}</strong> &middot;{" "}
                  {new Date(latestDump[0].started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                  {latestDump[0].bytes && <> &middot; {human(Number(latestDump[0].bytes))}</>}
                </>)
              : <span className="muted">no run recorded</span>}</dd>
          </div>
          <div>
            <dt>Last restore test</dt>
            <dd>{latestRestore[0]
              ? (<>
                  <strong>{latestRestore[0].status}</strong> &middot;{" "}
                  {new Date(latestRestore[0].started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                </>)
              : <span className="muted">no run recorded</span>}</dd>
          </div>
        </dl>
      </div>

      <div className="panel">
        <h2>Recent runs</h2>
        {recent.length === 0 ? (
          <p className="muted">
            No backup runs have been recorded yet. The nightly cron and the
            quarterly restore drill write their results here.
          </p>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Started</th>
                <th>Bytes</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.backup_type}</td>
                  <td>{r.status}</td>
                  <td className="small">{new Date(r.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
                  <td className="small">{r.bytes ? human(Number(r.bytes)) : <span className="muted">—</span>}</td>
                  <td className="small muted">{r.error_message ?? r.object_path ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
