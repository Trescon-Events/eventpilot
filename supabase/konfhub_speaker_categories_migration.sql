-- Per-speaker KonfHub speaker category (2026-10-20, Madhu) — first case: DFWS "Roundtable Speaker".
-- event_websites.konfhub_speaker_categories = the categories this event lets a producer pick per speaker
--   (JSON array of {id, label}; id is KonfHub's speaker_category_id). Empty/NULL = feature off for the event,
--   so every other event behaves exactly as before (one event-level category, or none).
-- event_speakers.konfhub_category_id = the category chosen for this speaker; NULL = the event default
--   (event_websites.konfhub_speaker_category_id, or KonfHub's uncategorized "Speaker" group when that is empty).
-- Additive only.

BEGIN;

ALTER TABLE event_websites ADD COLUMN IF NOT EXISTS konfhub_speaker_categories JSONB;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS konfhub_category_id TEXT;

COMMIT;
