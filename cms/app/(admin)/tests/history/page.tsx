// Phase 42 (Sprint 2 follow-up) — UX acceptance test history.
//
// Lists past runs persisted by saveUXTestRun, newest first. Each row
// summarises the counts and whether the run met the strict 6-of-6
// acceptance threshold (decisions §10). An expandable row shows the
// per-test results. Reads only; no mutations here.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type UXTestResultRow = {
  testId: string;
  title: string;
  status: "passed" | "failed" | "blocked" | "not_started";
  neededHelp: boolean;
  notes: string | null;
};

type RunRow = {
  id: string;
  tester_name: string | null;
  tester_email: string | null;
  app_version: string | null;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  blocked_tests: number;
  not_run_tests: number;
  needed_help: boolean;
  accepted: boolean;
  results: UXTestResultRow[];
  started_at: Date | null;
  completed_at: Date;
};

export default async function TestsHistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin" && user.role !== "editor") notFound();

  const runs = await query<RunRow>(
    `SELECT r.id, r.tester_name, r.app_version,
            r.total_tests, r.passed_tests, r.failed_tests,
            r.blocked_tests, r.not_run_tests, r.needed_help, r.accepted,
            r.results, r.started_at, r.completed_at,
            u.email AS tester_email
       FROM ux_test_runs r
       LEFT JOIN users u ON u.id = r.tester_user_id
       ORDER BY r.completed_at DESC
       LIMIT 100`,
  );

  const accepted = runs.filter((r) => r.accepted).length;

  return (
    <>
      <p className="crumbs">
        <Link href="/tests">UX tests</Link> / History
      </p>
      <header className="page-head">
        <h1>UX test history</h1>
        <p className="muted">
          Every run anyone has saved from the UX tests page. {accepted} of {runs.length}{" "}
          met the strict 6-of-6 acceptance threshold.
        </p>
      </header>

      {runs.length === 0 ? (
        <div className="panel">
          <p className="muted">
            No runs saved yet. Open <Link href="/tests">UX tests</Link>, record a
            run, then click <strong>Finish &amp; save to history</strong>.
          </p>
        </div>
      ) : (
        <ul className="plain-list ux-history">
          {runs.map((r) => (
            <li key={r.id} className={`panel ux-history__run ${r.accepted ? "ux-history__run--accepted" : ""}`}>
              <div className="ux-history__head">
                <div>
                  <strong>
                    {r.tester_name || r.tester_email || "Unknown tester"}
                  </strong>
                  <span className="muted small">
                    {" "}&middot; {new Date(r.completed_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                  </span>
                </div>
                <div className="ux-history__counts">
                  <span className="ux-history__pill ux-history__pill--pass">{r.passed_tests}</span>
                  {r.failed_tests > 0 && <span className="ux-history__pill ux-history__pill--fail">{r.failed_tests}</span>}
                  {r.blocked_tests > 0 && <span className="ux-history__pill ux-history__pill--blocked">{r.blocked_tests}</span>}
                  {r.not_run_tests > 0 && <span className="ux-history__pill ux-history__pill--notrun">{r.not_run_tests}</span>}
                  <span className={`ux-history__verdict ${r.accepted ? "ux-history__verdict--ok" : "ux-history__verdict--miss"}`}>
                    {r.accepted ? "ACCEPTED (6/6)" : "FAILED (<6)"}
                  </span>
                </div>
              </div>
              <details className="ux-history__details">
                <summary className="small muted">Per-test breakdown</summary>
                <ol className="ux-history__list">
                  {r.results.map((t, i) => (
                    <li key={t.testId} className={`ux-history__test ux-history__test--${t.status}`}>
                      <span className="ux-history__test-n">Test {i + 1}</span>
                      <span className="ux-history__test-title">{t.title}</span>
                      <span className={`ux-history__test-status ux-history__test-status--${t.status}`}>
                        {t.status.toUpperCase().replace("_", " ")}
                      </span>
                      {t.notes && <span className="small muted ux-history__test-notes">{t.notes}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
