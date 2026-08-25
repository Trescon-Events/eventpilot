-- KonfHub Speakers-module tag support (2026-08-25) — a speaker can be
-- listed on KonfHub as Speaker, Moderator, or both, without duplicating
-- the underlying event_speakers row. Confirmed live: a single KonfHub
-- speaker record can hold multiple tags at once (tags: [{id, name}]),
-- and renders correctly on both KonfHub's own page and the event website
-- per Madhu's own check — no duplicate KonfHub record needed.
--
-- konfhub_tag_speaker defaults true for every existing AND future row —
-- Postgres applies a column DEFAULT to existing rows on ADD COLUMN, so
-- this single migration both sets the default for new speakers and
-- backfills the current roster (all currently unlisted-as-moderator on
-- KonfHub, matches the DEFAULT true/false split exactly).
--
-- konfhub_speaker_tag_id/konfhub_moderator_tag_id on event_websites are
-- this event's real KonfHub tag ids (GET /event/:id/tags, undocumented,
-- found live 2026-08-25) — per-event config, same pattern as
-- konfhub_registration_field_map, since tag ids aren't portable across
-- events. Populated directly via UPDATE below for WAIS Malaysia.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_tag_speaker BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_tag_moderator BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_speaker_tag_id TEXT;
ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_moderator_tag_id TEXT;

UPDATE event_websites
SET konfhub_speaker_tag_id = '23c4bd87-741c-419f-8b98-b3791e46f3cf',
    konfhub_moderator_tag_id = 'efa2439b-61a3-4685-bbfd-d321980869da'
WHERE event_id = '5e2f89f4-49aa-4358-9791-f7654685246d';

COMMIT;
