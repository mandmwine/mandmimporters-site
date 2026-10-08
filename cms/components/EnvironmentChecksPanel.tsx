"use client";
// Phase 33 (Sprint 1) — Environment health check panel (client half).
//
// Lives on /settings/environment. Renders the latest known state for
// each probed service, with a "Run checks again" button that calls the
// runEnvironmentChecks server action and refreshes the rows in place.
import { useState, useTransition } from "react";
import { runEnvironmentChecks } from "@/lib/actions";

export type HealthRow = {
  service: string;
  status: "ok" | "degraded" | "failed" | "missing";
  latency_ms: number | null;
  message: string;
  checked_at?: string;
};

export default function EnvironmentChecksPanel({
  serviceLabel,
  serviceOrder,
  initialLatest,
}: {
  serviceLabel: Record<string, string>;
  serviceOrder: string[];
  initialLatest: Record<string, HealthRow>;
}) {
  const [rows, setRows] = useState<Record<string, HealthRow>>(initialLatest);
  const [lastRunAt, setLastRunAt] = useState<string | null>(
    Object.values(initialLatest)
      .map((r) => r.checked_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null,
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const res = await runEnvironmentChecks();
      if (!res.ok || !res.results) {
        setError(res.message ?? "Checks failed.");
        return;
      }
      const nextIso = new Date().toISOString();
      const next: Record<string, HealthRow> = { ...rows };
      for (const r of res.results) {
        next[r.service] = { ...r, checked_at: nextIso };
      }
      setRows(next);
      setLastRunAt(nextIso);
    });
  }

  const ordered = serviceOrder.map((s) => ({ key: s, row: rows[s] }));

  return (
    <div className="panel env-panel">
      <div className="panel-head">
        <h2>Service health</h2>
        <button type="button" className="btn small" onClick={run} disabled={pending}>
          {pending ? "Checking…" : "Run checks again"}
        </button>
      </div>
      <p className="small muted">
        {lastRunAt
          ? `Last checked ${new Date(lastRunAt).toLocaleString("en-US", { timeZone: "America/New_York" })}.`
          : "No checks have run yet. Click Run checks again."}
      </p>
      {error && <p className="error small">{error}</p>}
      <ul className="env-list">
        {ordered.map(({ key, row }) => (
          <li key={key} className={`env-row env-row--${row?.status ?? "mute"}`}>
            <strong>{serviceLabel[key] ?? key}</strong>
            <span className="env-row__status">
              {row ? statusLabel(row.status) : "not yet checked"}
              {row?.latency_ms !== null && row?.latency_ms !== undefined && (
                <span className="muted small"> &middot; {row.latency_ms} ms</span>
              )}
            </span>
            {row?.message && (
              <p className="small muted env-row__msg">{row.message}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(s: HealthRow["status"]): string {
  switch (s) {
    case "ok": return "Healthy";
    case "degraded": return "Degraded";
    case "failed": return "Failed";
    case "missing": return "Not configured";
  }
}
