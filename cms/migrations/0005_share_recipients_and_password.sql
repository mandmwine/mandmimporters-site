-- Phase 16: per-recipient trackable share links + optional password gate.
--
-- recipient_name / recipient_email let the owner mint one link per buyer so
-- view_count tells them who looked at the catalog. password_hash +
-- password_set_at protect a link with a passphrase: the share page requires
-- the user to enter it once per browser (cookie), then shows the catalog as
-- before.

ALTER TABLE catalog_shares
  ADD COLUMN IF NOT EXISTS recipient_name   text,
  ADD COLUMN IF NOT EXISTS recipient_email  text,
  ADD COLUMN IF NOT EXISTS password_hash    text,       -- scrypt-N14, salt included; NULL = no password
  ADD COLUMN IF NOT EXISTS password_set_at  timestamptz;

CREATE INDEX IF NOT EXISTS catalog_shares_recipient_idx
  ON catalog_shares (lower(recipient_email))
  WHERE recipient_email IS NOT NULL;
