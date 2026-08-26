-- KonfHub-aware speaker delete (2026-08-26) — the Hub's existing
-- soft-delete ("Also remove from the live public event website" checkbox,
-- 2026-07-28) never touched KonfHub at all. Adding two more independent,
-- opt-in delete actions:
--
-- konfhub_speaker_removed_at — stamped when a producer checks "Also remove
-- from KonfHub Speakers listing" at delete time and the real
-- DELETE /event/:id/speakers/:id call (deleteKonfhubSpeaker(),
-- app/lib/konfhub-speakers.ts) succeeds. konfhub_speaker_id itself is
-- cleared to NULL at the same time, so a future "Push to KonfHub" creates a
-- fresh record instead of erroring against a now-deleted id.
--
-- konfhub_registration_cancel_requested_at — stamped when a producer checks
-- "Flag KonfHub registration for manual cancellation." KonfHub's own API
-- (per their 2026-08-25 Postman docs) has no delete/cancel endpoint for an
-- Attendee Registration booking — only create and update — so this can't
-- be automated. It's purely a to-do flag surfaced on the Deleted tab until
-- someone cancels it by hand in KonfHub's own dashboard and marks it done
-- (which clears this column back to NULL, same as Restore does).
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_speaker_removed_at TIMESTAMPTZ;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_registration_cancel_requested_at TIMESTAMPTZ;

COMMIT;
