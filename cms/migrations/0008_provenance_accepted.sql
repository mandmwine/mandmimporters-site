-- Phase 38 (Sprint 2) — Source conflict resolution.
--
-- Decisions doc §2 asked for a stronger verification_status vocabulary so
-- losers are preserved as *explicitly rejected*, not just made non-current.
-- Original CHECK: ('unverified', 'verified', 'conflict', 'rejected')
-- New CHECK:      ('unverified', 'verified', 'conflict', 'accepted',
--                  'rejected', 'superseded')
--
-- Meaning:
--   unverified — row created but not yet reviewed
--   verified   — a human confirmed the source matches reality
--   conflict   — multiple rows disagree for this (entity, field)
--   accepted   — human picked this row as the winner in a conflict (new)
--   rejected   — human marked this row as wrong (now also set on the
--                losers of a conflict resolution, not just manual rejects)
--   superseded — a newer row overrode this one (new, reserved for future
--                vintage-change workflow)
--
-- No data migration is needed; existing rows keep their current status.

ALTER TABLE field_provenance
  DROP CONSTRAINT IF EXISTS field_provenance_verification_status_check;

ALTER TABLE field_provenance
  ADD CONSTRAINT field_provenance_verification_status_check
  CHECK (verification_status IN ('unverified', 'verified', 'conflict', 'accepted', 'rejected', 'superseded'));
