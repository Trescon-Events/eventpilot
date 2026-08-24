-- Push-to-KonfHub speaker publish action (2026-08-24) — see
-- app/api/events/stakeholders/speakers/[id]/konfhub-push/route.ts.
-- konfhub_speaker_id (added by konfhub_speakers_migration.sql) already
-- tells a caller whether a speaker has ever been pushed; this adds WHEN,
-- which the push button doesn't strictly need but a future roster
-- "KonfHub" status column (matching the existing Website/Social Post/Self
-- Promo 3-state columns) and the separately-scoped KonfHub->EventPilot
-- pull sync both will.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_synced_at TIMESTAMPTZ;

COMMIT;
