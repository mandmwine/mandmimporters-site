-- Phase 46 (final-decisions §20.1) — Factual AI proposals require a source.
--
-- The current ai_actions table captures the AI's output text but has no
-- field for *type* or *source*. Decisions §20.1 ruled: a factual proposal
-- (vintage, blend, aging, mevushal, supervision, designation, appellation,
-- bottle size, critic score) cannot be accepted without a source id;
-- a copy proposal (tasting_note, food_pairing, short_description,
-- wine_story, producer_bio, asset_alt_text) can.
--
-- This migration adds the two columns, backfills existing rows to the
-- correct type (via the action column), and leaves source_id null for
-- all existing rows — the gate in acceptProposal only applies to new
-- factual proposals from this migration forward, so a backlog of
-- already-proposed facts can still be accepted the old way.

ALTER TABLE ai_actions
  ADD COLUMN IF NOT EXISTS proposal_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES sources(id);

-- Backfill types from the action column. Everything we currently
-- generate falls cleanly into one bucket; anything novel will stay
-- null and be treated as 'copy' (lax) until the proposer labels it.
UPDATE ai_actions
   SET proposal_type = CASE action
     WHEN 'find_scores'          THEN 'fact'
     WHEN 'fill_vintage_details' THEN 'fact'
     WHEN 'tasting_note'         THEN 'copy'
     WHEN 'condense'             THEN 'copy'
     WHEN 'rewrite_voice'        THEN 'copy'
     WHEN 'producer_bio'         THEN 'copy'
     WHEN 'asset_alt_text'       THEN 'copy'
     ELSE 'copy'
   END
 WHERE proposal_type IS NULL;

ALTER TABLE ai_actions
  ALTER COLUMN proposal_type SET DEFAULT 'copy',
  ALTER COLUMN proposal_type SET NOT NULL;

ALTER TABLE ai_actions
  ADD CONSTRAINT ai_actions_proposal_type_check
    CHECK (proposal_type IN ('fact', 'copy'));

CREATE INDEX IF NOT EXISTS ai_actions_proposal_type_idx
  ON ai_actions (proposal_type, status);
