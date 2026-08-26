-- KonfHub "Speaker Category" support (2026-08-26) — for an umbrella
-- KonfHub event that hosts several separately-branded sub-events under
-- one event_id (first case: Dubai Future Finance Week — Dubai FinTech
-- Summit, Future Sustainability Forum, Future Islamic Finance Forum,
-- Future Tokenisation Forum, all on KonfHub event f133240e-1331-44f2-
-- 8d6e-6217b3b8984d), where each sub-event is its own separate EventPilot
-- event/website but all share that one KonfHub event.
--
-- KonfHub distinguishes a speaker's sub-event via its own native
-- `speaker_category_id` field (confirmed live via GET /event/:id/speakers
-- — NOT the `tags` array used for the Speaker/Moderator feature above;
-- category is single-valued and per-event, tags are a list and
-- per-speaker). konfhub_speaker_category_id on event_websites says which
-- category id this EventPilot event's KonfHub pushes should use — unset
-- (null) for a normal 1:1 EventPilot-event-to-KonfHub-event, same
-- omit-if-unset convention as every other optional KonfHub field here.
--
-- No new event_speakers column needed — category is implicit from which
-- EventPilot event's roster a speaker row lives in, not a per-speaker
-- choice.
--
-- Values are set via the Website Settings UI (KonfHub Speaker Category ID
-- field), not hardcoded here — unlike the one-off Speaker/Moderator tag
-- ids, this needs a different value across 4 (and growing) events, so a
-- real UI field with an audit trail beats another manual SQL UPDATE.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_speaker_category_id TEXT;

COMMIT;
