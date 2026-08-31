-- Second-role KonfHub speaker record (2026-08-31) — KonfHub's own Agenda
-- tool has no per-session speaker/moderator role: whichever tag a KonfHub
-- speaker record carries is what shows next to their name in every
-- session they're assigned to. Someone who speaks in one session and
-- moderates a different one needs a second, distinct KonfHub record to
-- be assignable with the right role in each session's Agenda picker.
-- Producers have been working around this by hand: duplicating the
-- speaker directly in KonfHub, tagging the copy with whichever role
-- wasn't already covered, and pushing it to the bottom of the list —
-- KonfHub has no "hide from public listing" capability (confirmed with
-- Madhu 2026-08-31), so both copies stay visible either way, same as
-- this will.
--
-- Deliberately role-agnostic (not "moderator_speaker_id" — an earlier,
-- narrower version of this migration used that name before Madhu pointed
-- out the asymmetry, 2026-08-31): event_speakers.konfhub_tag_speaker/
-- konfhub_tag_moderator (konfhub_speaker_tags_migration.sql) are now
-- mutually exclusive — a speaker's PRIMARY KonfHub record (konfhub_
-- speaker_id) always carries exactly one of the two tags, whichever role
-- was confirmed first. This second record always carries the OTHER one,
-- computed as the complement at push time (see konfhub-push-secondary/
-- route.ts) — there is no separate "moderator twin" vs "speaker twin",
-- just one second-role slot that could be either, deterministically.
--
-- konfhub_secondary_speaker_id/konfhub_secondary_synced_at are kept fully
-- separate from the primary konfhub_speaker_id/konfhub_synced_at above —
-- one event_speakers row can now back two independent KonfHub speaker
-- records (primary + second-role) without duplicating anything in
-- EventPilot's own speaker list. See the speaker Details page's "Second
-- Role" tab.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_secondary_speaker_id TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_secondary_synced_at TIMESTAMPTZ;

COMMIT;
