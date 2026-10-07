-- Phase 11 (UX pass 4): per-user saved filter views.
-- A "view" is a named URL that reproduces the current list + filters + sort,
-- so you can pin "Reds · needs review · US" as a tab and come back later.
CREATE TABLE IF NOT EXISTS saved_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       text NOT NULL,              -- e.g. 'wines', 'catalogs', 'assets'
  name        text NOT NULL,              -- what the user calls it
  path        text NOT NULL,              -- '/wines'
  query       text NOT NULL,              -- '?status=needs_review&missing=bottle'
  pinned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_views_user_scope_idx ON saved_views (user_id, scope);
