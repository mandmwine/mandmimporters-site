-- Phase 33 (Sprint 1 — Operational certainty) schema additions.
--
-- Covers §8 (environment status page), §18 (backup monitoring) and §19
-- (error reporting / health snapshots) of the final decisions doc.

-- ---------------------------------------------------------------------------
-- System health checks — a rolling log of per-service probes. Written by
-- the Settings → Environment "Run checks" action, and by any cron/CI that
-- wants to leave a breadcrumb. We don't prune this table aggressively —
-- it's small (a row per probe per service) and useful for diagnosing a
-- degraded day. The AI retention cron can trim it on the same cadence
-- as ai_actions if it grows (see cleanup-ai-history route).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_health_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service     text        NOT NULL,  -- e.g. 'database', 'anthropic', 'dropbox', 'dropbox_content', 'firebase', 'pdf_renderer'
  status      text        NOT NULL CHECK (status IN ('ok', 'degraded', 'failed', 'missing')),
  latency_ms  integer,
  message     text,                   -- short human-readable reason, never a secret
  checked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_health_checks_service_time_idx
  ON system_health_checks (service, checked_at DESC);

-- ---------------------------------------------------------------------------
-- Backup runs — a log for independent nightly dumps (§18). The pg_dump
-- cron (or whatever process runs it) inserts a row per attempt. The
-- Settings → Backups page reads the newest row per backup_type.
-- Cloud SQL's own managed backups are reported separately via a health
-- check row with service = 'cloud_sql_backup'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type   text        NOT NULL CHECK (backup_type IN ('pg_dump', 'restore_test')),
  status        text        NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  object_path   text,                   -- gs://... when succeeded
  bytes         bigint,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS backup_runs_type_time_idx
  ON backup_runs (backup_type, started_at DESC);

-- ---------------------------------------------------------------------------
-- UX test runs — Phase 31 originally persisted to localStorage only.
-- Per §9 of the final decisions, completed runs should sync here too so
-- results survive clear-site-data and show up across devices.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ux_test_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tester_user_id  uuid REFERENCES users(id),
  tester_name     text,
  app_version     text,          -- commit sha when known
  total_tests     integer NOT NULL,
  passed_tests    integer NOT NULL,
  failed_tests    integer NOT NULL,
  blocked_tests   integer NOT NULL DEFAULT 0,
  not_run_tests   integer NOT NULL DEFAULT 0,
  needed_help     boolean NOT NULL DEFAULT false,  -- true if any test's tester needed verbal instruction
  accepted        boolean NOT NULL DEFAULT false,  -- isUXRunAccepted — strict 6-of-6 + no help
  results         jsonb   NOT NULL,                -- array<UXTestResult>
  started_at      timestamptz,
  completed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ux_test_runs_completed_idx
  ON ux_test_runs (completed_at DESC);
