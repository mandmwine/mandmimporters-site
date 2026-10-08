// Phase 33 (Sprint 1) — Environment & health probes.
//
// Serves the Settings → Environment page. Each probe returns a HealthResult;
// the aggregate caller writes a row to system_health_checks for each probe.
//
// Rules:
//   - Never return a secret value. presence / configured are OK; value is not.
//   - Each probe should be bounded (fetches cap at 5 s via AbortController).
//   - Each probe is pure: no side effects other than its own HTTP calls.
//   - "missing" means the env var isn't set at all; "failed" means it's set
//     but the probe failed; "degraded" means it half-worked (e.g. token valid
//     but can't read the configured folder).

import "server-only";
import { query, dbConfigured } from "@/lib/db";

export type HealthStatus = "ok" | "degraded" | "failed" | "missing";

export type HealthResult = {
  service: string;
  status: HealthStatus;
  latency_ms: number | null;
  message: string;
};

// Every required env var — the Env page lists these with set/missing.
// We intentionally include a mix of hard requirements (DATABASE_URL,
// ANTHROPIC_API_KEY) and soft ones (DROPBOX_ACCESS_TOKEN, SENTRY_DSN)
// so the operator sees the full posture at a glance.
export const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "CRON_SECRET",
] as const;

export const OPTIONAL_ENV_VARS = [
  "DROPBOX_ACCESS_TOKEN",
  "DROPBOX_WINE_IMAGE_ROOT",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "BACKUP_BUCKET",
  "CHROMIUM_EXECUTABLE_URL",
] as const;

export type EnvPresence = { name: string; required: boolean; configured: boolean };

export function getEnvironmentPresence(): EnvPresence[] {
  const req = REQUIRED_ENV_VARS.map((name) => ({
    name,
    required: true,
    configured: Boolean(process.env[name]),
  }));
  const opt = OPTIONAL_ENV_VARS.map((name) => ({
    name,
    required: false,
    configured: Boolean(process.env[name]),
  }));
  return [...req, ...opt];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export async function checkDatabase(): Promise<HealthResult> {
  if (!dbConfigured()) {
    return { service: "database", status: "missing", latency_ms: null, message: "DATABASE_URL / Cloud SQL env not configured." };
  }
  try {
    const { ms } = await timed(() => withTimeout(query("SELECT 1 AS ok"), 5_000, "database"));
    return { service: "database", status: "ok", latency_ms: ms, message: `Round-trip ${ms} ms.` };
  } catch (err) {
    return { service: "database", status: "failed", latency_ms: null, message: shortError(err) };
  }
}

export async function checkAnthropic(): Promise<HealthResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { service: "anthropic", status: "missing", latency_ms: null, message: "ANTHROPIC_API_KEY not set." };
  }
  // GET /v1/models requires only the key, no body, so this is a cheap token-only probe.
  try {
    const { value: res, ms } = await timed(() =>
      withTimeout(
        fetch("https://api.anthropic.com/v1/models?limit=1", {
          method: "GET",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY as string,
            "anthropic-version": "2023-06-01",
          },
          cache: "no-store",
        }),
        5_000,
        "anthropic",
      ),
    );
    if (res.ok) return { service: "anthropic", status: "ok", latency_ms: ms, message: `Round-trip ${ms} ms.` };
    const text = await res.text().catch(() => "");
    return { service: "anthropic", status: "failed", latency_ms: ms, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  } catch (err) {
    return { service: "anthropic", status: "failed", latency_ms: null, message: shortError(err) };
  }
}

export async function checkDropboxConnection(): Promise<HealthResult> {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    return { service: "dropbox", status: "missing", latency_ms: null, message: "DROPBOX_ACCESS_TOKEN not set." };
  }
  try {
    const { value: res, ms } = await timed(() =>
      withTimeout(
        fetch("https://api.dropboxapi.com/2/users/get_current_account", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        5_000,
        "dropbox",
      ),
    );
    if (res.ok) return { service: "dropbox", status: "ok", latency_ms: ms, message: `Account accessible (${ms} ms).` };
    return { service: "dropbox", status: "failed", latency_ms: ms, message: `HTTP ${res.status}` };
  } catch (err) {
    return { service: "dropbox", status: "failed", latency_ms: null, message: shortError(err) };
  }
}

// This is the probe that caught §5 of the decisions doc: "treat Dropbox as
// offline until verified." A token with the wrong scopes passes
// users/get_current_account but fails files/list_folder — this probe is
// what distinguishes the two.
export async function checkDropboxContentRead(): Promise<HealthResult> {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    return { service: "dropbox_content", status: "missing", latency_ms: null, message: "DROPBOX_ACCESS_TOKEN not set." };
  }
  const path = process.env.DROPBOX_WINE_IMAGE_ROOT ?? "";
  try {
    const { value: res, ms } = await timed(() =>
      withTimeout(
        fetch("https://api.dropboxapi.com/2/files/list_folder", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path, recursive: false, limit: 1 }),
          cache: "no-store",
        }),
        5_000,
        "dropbox_content",
      ),
    );
    if (res.ok) return { service: "dropbox_content", status: "ok", latency_ms: ms, message: `files.content.read verified (${ms} ms).` };
    const text = await res.text().catch(() => "");
    // 401 scope-missing is the symptom §5 described — surface it plainly.
    const likelyScope = res.status === 401 && /missing_scope|insufficient/i.test(text);
    return {
      service: "dropbox_content",
      status: "failed",
      latency_ms: ms,
      message: likelyScope
        ? "Token lacks files.content.read — regenerate it with that scope and update DROPBOX_ACCESS_TOKEN."
        : `HTTP ${res.status}: ${text.slice(0, 160)}`,
    };
  } catch (err) {
    return { service: "dropbox_content", status: "failed", latency_ms: null, message: shortError(err) };
  }
}

export async function checkFirebaseStorage(): Promise<HealthResult> {
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) {
    return { service: "firebase", status: "missing", latency_ms: null, message: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET not set." };
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return { service: "firebase", status: "degraded", latency_ms: null, message: "Bucket configured but FIREBASE_SERVICE_ACCOUNT_JSON missing — asset uploads will fail." };
  }
  try {
    const { signedUrl } = await import("@/lib/storage");
    // Sign a URL for a path that doesn't need to exist — the signing only
    // validates the credential, not the object. Fastest and cheapest probe.
    const { ms } = await timed(() => withTimeout(signedUrl("__healthcheck__/does-not-exist", 1), 5_000, "firebase"));
    return { service: "firebase", status: "ok", latency_ms: ms, message: `Signing works (${ms} ms).` };
  } catch (err) {
    return { service: "firebase", status: "failed", latency_ms: null, message: shortError(err) };
  }
}

// This is a cheap "renderer wiring" probe — it checks that the hosted
// Chromium binary URL is set, not that we actually launch Chrome (which
// would take 10+ s). Launching for real is a smoke test that belongs in
// a nightly cron, not an on-demand page click.
export function checkPdfRenderer(): HealthResult {
  const url = process.env.CHROMIUM_EXECUTABLE_URL;
  if (!url) {
    return { service: "pdf_renderer", status: "missing", latency_ms: null, message: "CHROMIUM_EXECUTABLE_URL not set — PDF export will fail." };
  }
  return { service: "pdf_renderer", status: "ok", latency_ms: 0, message: "Chromium binary URL is configured." };
}

export function checkCronSecret(): HealthResult {
  if (!process.env.CRON_SECRET) {
    return { service: "cron_secret", status: "missing", latency_ms: null, message: "CRON_SECRET not set — scheduled jobs will refuse themselves." };
  }
  return { service: "cron_secret", status: "ok", latency_ms: 0, message: "Cron secret is configured." };
}

// ---------------------------------------------------------------------------
// Aggregator — runs every probe in parallel, writes a row per service, and
// returns the latest results plus a summary. Called from the server action.
// ---------------------------------------------------------------------------

export async function runAllHealthChecks(): Promise<HealthResult[]> {
  const results = await Promise.all([
    checkDatabase(),
    checkAnthropic(),
    checkDropboxConnection(),
    checkDropboxContentRead(),
    checkFirebaseStorage(),
    Promise.resolve(checkPdfRenderer()),
    Promise.resolve(checkCronSecret()),
  ]);

  // Record each probe. Done sequentially so the writes are ordered; this is
  // 7 cheap INSERTs so the latency is negligible.
  try {
    for (const r of results) {
      await query(
        `INSERT INTO system_health_checks (service, status, latency_ms, message)
         VALUES ($1, $2, $3, $4)`,
        [r.service, r.status, r.latency_ms, r.message],
      );
    }
  } catch (err) {
    // If the DB probe itself failed, don't let a secondary write failure
    // mask the real result. Just log and move on.
    console.warn("[health] failed to persist probe results", err);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Last-known-good: read the newest row per service. Used when the page
// first loads so the user sees stale-but-recent state instead of a blank
// panel while they wait for a fresh run.
// ---------------------------------------------------------------------------

export async function getLatestHealthByService(): Promise<Record<string, HealthResult & { checked_at: Date }>> {
  if (!dbConfigured()) return {};
  try {
    const rows = await query<{ service: string; status: HealthStatus; latency_ms: number | null; message: string | null; checked_at: Date }>(
      `SELECT DISTINCT ON (service) service, status, latency_ms, message, checked_at
         FROM system_health_checks
         ORDER BY service, checked_at DESC`,
    );
    const out: Record<string, HealthResult & { checked_at: Date }> = {};
    for (const r of rows) {
      out[r.service] = {
        service: r.service,
        status: r.status,
        latency_ms: r.latency_ms,
        message: r.message ?? "",
        checked_at: r.checked_at,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function shortError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 240);
  return String(err).slice(0, 240);
}
