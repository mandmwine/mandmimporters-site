-- Phase 34 (Sprint 1) — Internal error log.
--
-- The decisions doc §19 asked for Sentry plus an internal status page.
-- Sentry adds a third-party dependency, a webpack plugin, source-map
-- uploads, and a build-time wiring that can wedge a deploy. Phase 34
-- ships the "internal" half first: a plain table we write to from
-- server actions and route handlers via a captureError() helper, and
-- a /settings/system page that reads it. External Sentry can layer on
-- top later without touching callers.
--
-- Rows are deliberately coarse — one row per captured error, with the
-- context (route, user_id if known, extra JSON) that the caller passes.
-- No stack-trace deduplication; the sixty-day retention cron keeps
-- this table bounded.

CREATE TABLE IF NOT EXISTS system_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,                  -- 'route' | 'action' | 'cron' | 'ai' | 'export' | 'other'
  route         text,                            -- e.g. '/api/catalogs/.../export' or 'runEnvironmentChecks'
  user_id       uuid REFERENCES users(id),
  message       text NOT NULL,
  stack         text,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_errors_occurred_idx
  ON system_errors (occurred_at DESC);
CREATE INDEX IF NOT EXISTS system_errors_kind_idx
  ON system_errors (kind, occurred_at DESC);
