-- Phase 10: public read-only share links for catalogs.
-- A share is a random opaque token that lets anyone with the URL view a
-- read-only version of a catalog at /share/catalog/<token>. No expiry by
-- default; the admin revokes a link when it should stop working.
CREATE TABLE IF NOT EXISTS catalog_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id      uuid NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,          -- url-safe random, 24+ bytes
  label           text,                          -- human-readable, e.g. "Spring 2026 — distributor set"
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,                   -- NULL = no expiry
  revoked_at      timestamptz,                   -- NULL = active
  last_viewed_at  timestamptz,
  view_count      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS catalog_shares_catalog_idx ON catalog_shares (catalog_id);
