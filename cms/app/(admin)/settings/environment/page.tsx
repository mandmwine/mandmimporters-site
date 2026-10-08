// Phase 33 (Sprint 1) — Environment & health page.
//
// Admin-only. Lists every required and optional env var's presence
// (never its value), and shows the last-known status for each probed
// service. The Run checks button triggers a fresh round via a server
// action; results persist to system_health_checks.
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEnvironmentPresence, getLatestHealthByService } from "@/lib/health/environment";
import EnvironmentChecksPanel from "@/components/EnvironmentChecksPanel";

export const dynamic = "force-dynamic";

const SERVICE_LABEL: Record<string, string> = {
  database: "Database",
  anthropic: "Anthropic API",
  dropbox: "Dropbox (connection)",
  dropbox_content: "Dropbox (files.content.read)",
  firebase: "Firebase Storage",
  pdf_renderer: "PDF renderer",
  cron_secret: "Cron secret",
};

const SERVICE_ORDER = [
  "database",
  "anthropic",
  "firebase",
  "pdf_renderer",
  "dropbox",
  "dropbox_content",
  "cron_secret",
];

export default async function EnvironmentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  if (user.role !== "admin") notFound();

  const presence = getEnvironmentPresence();
  const latest = await getLatestHealthByService();

  const required = presence.filter((p) => p.required);
  const optional = presence.filter((p) => !p.required);

  return (
    <>
      <header className="page-head">
        <h1>Environment</h1>
        <p className="muted">
          Which environment variables are set, which services are reachable.
          Values are never displayed — only &ldquo;set&rdquo; or &ldquo;missing&rdquo;.
        </p>
      </header>

      <div className="panel env-panel">
        <h2>Required</h2>
        <ul className="env-list">
          {required.map((p) => (
            <li key={p.name} className={p.configured ? "env-row env-row--ok" : "env-row env-row--err"}>
              <code>{p.name}</code>
              <span className="env-row__status">
                {p.configured ? "configured" : "missing"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel env-panel">
        <h2>Optional</h2>
        <ul className="env-list">
          {optional.map((p) => (
            <li key={p.name} className={p.configured ? "env-row env-row--ok" : "env-row env-row--mute"}>
              <code>{p.name}</code>
              <span className="env-row__status">
                {p.configured ? "configured" : "not set"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <EnvironmentChecksPanel
        serviceLabel={SERVICE_LABEL}
        serviceOrder={SERVICE_ORDER}
        initialLatest={Object.fromEntries(
          Object.entries(latest).map(([k, v]) => [
            k,
            { ...v, checked_at: v.checked_at.toISOString() },
          ]),
        )}
      />
    </>
  );
}
