-- Public figures: two phases, pre-event and post-event (16 Nov 2026).
--
-- One definition of every figure (Footfall, Speakers, ...) with a pre-event version (expected / target, as published before the event) and a post-event version (the actual).
-- Each phase is its own row, so the approval, versions, review rounds and audit trail work exactly as before, per phase.
--
-- NOTHING EXISTING IS DELETED OR CHANGED IN VALUE. Every existing item gets phase = 'post' (they were all created after the event: BSS 2026, Thulasi's stats).
-- The only structural change: the "one label per group per event" unique index is rebuilt to include the phase, so "Footfall" can exist once per phase.
-- Backward compatible: code that does not know about phases keeps inserting phase 'post' (the default) and works as before.
-- Run by hand through the session-pooler psql connection. Safe to re-run.

BEGIN;

ALTER TABLE event_public_figures ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'post';
ALTER TABLE event_public_figures DROP CONSTRAINT IF EXISTS event_public_figures_phase_check;
ALTER TABLE event_public_figures ADD CONSTRAINT event_public_figures_phase_check CHECK (phase IN ('pre', 'post'));

DROP INDEX IF EXISTS uq_event_public_figures_label;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_public_figures_label ON event_public_figures (event_id, phase, COALESCE(group_label, ''), LOWER(label)) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_event_public_figures_phase ON event_public_figures (event_id, phase, is_active);

COMMIT;
