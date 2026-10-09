// Phase 34 (Sprint 1) — Internal error capture.
//
// A single helper, captureError(err, context), writes to system_errors so
// the Settings → System page can show what blew up without the operator
// opening Vercel logs. Safe to call from any server-side code path; it
// never throws (any DB write failure is swallowed and logged).
//
// Guidelines:
//   - Call this at *catch sites* that would otherwise hide the error —
//     a route that returns 500, a cron that logs and continues, an AI
//     helper that falls back to a placeholder. Don't wrap every tool
//     call; the capture is for things the user won't otherwise see.
//   - Context is a free-form JSON object. Keep it small (< 1 KB) and
//     never pass secret material (tokens, passwords, raw cookies).
//   - This file is a seam. Phase 35+ can add a Sentry sink alongside
//     the DB write by extending this one function.

import "server-only";
import { query, dbConfigured } from "@/lib/db";

export type ErrorKind = "route" | "action" | "cron" | "ai" | "export" | "other";

export type ErrorContext = {
  kind: ErrorKind;
  route?: string;
  userId?: string | null;
  extra?: Record<string, unknown>;
};

export async function captureError(err: unknown, ctx: ErrorContext): Promise<void> {
  // Always log to the serverless console first; the DB write is best-effort.
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  const label = `${ctx.kind}${ctx.route ? `:${ctx.route}` : ""}`;
  console.error(`[captureError] ${label}: ${message}`, ctx.extra);

  // Phase 50 (final-decisions §19) — forward to Sentry when configured.
  // Lazy, dynamic, gated. A build without @sentry/nextjs installed still
  // works; a build with the package but no SENTRY_DSN still works; a
  // build with both will initialise Sentry on first error and start
  // sending. This keeps next.config untouched, so there's no risk of a
  // Sentry misconfigure wedging the deploy.
  if (process.env.SENTRY_DSN) {
    try {
      await forwardToSentry(err, ctx);
    } catch (sentryErr) {
      console.warn("[captureError] Sentry forward failed", sentryErr);
    }
  }

  if (!dbConfigured()) return;

  try {
    await query(
      `INSERT INTO system_errors (kind, route, user_id, message, stack, context)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        ctx.kind,
        ctx.route ?? null,
        ctx.userId ?? null,
        message.slice(0, 2000),
        stack ? stack.slice(0, 8000) : null,
        JSON.stringify(ctx.extra ?? {}),
      ],
    );
  } catch (writeErr) {
    // Swallow — if we can't write, we don't want the caller's error path
    // replaced with a secondary failure. Still log it to stderr.
    console.warn("[captureError] failed to persist", writeErr);
  }
}

// Thin wrapper for the common "wrap a server action" shape. Any throw
// gets captured with the action name and the user (if the action grabbed
// one) in context, then rethrows so the client still sees the failure.
// Phase 50 — one-time Sentry init with the right filters. Flag kept at
// module scope so init runs at most once per Lambda instance.
let sentryInitDone = false;
async function forwardToSentry(err: unknown, ctx: ErrorContext): Promise<void> {
  const Sentry = (await import("@sentry/nextjs")) as typeof import("@sentry/nextjs");
  if (!sentryInitDone) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      environment: process.env.VERCEL_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
      // Decisions §19 — filter sensitive headers so Sentry never
      // records auth cookies or bearer tokens.
      beforeSend(event) {
        if (event.request?.headers) {
          delete (event.request.headers as Record<string, unknown>).authorization;
          delete (event.request.headers as Record<string, unknown>).cookie;
        }
        return event;
      },
    });
    sentryInitDone = true;
  }
  Sentry.captureException(err, {
    tags: {
      kind: ctx.kind,
      ...(ctx.route ? { route: ctx.route } : {}),
    },
    extra: ctx.extra,
    user: ctx.userId ? { id: ctx.userId } : undefined,
  });
}

export async function withErrorCapture<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { kind?: ErrorKind; userId?: string | null; extra?: Record<string, unknown> } = {},
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await captureError(err, {
      kind: opts.kind ?? "action",
      route: name,
      userId: opts.userId ?? null,
      extra: opts.extra,
    });
    throw err;
  }
}
