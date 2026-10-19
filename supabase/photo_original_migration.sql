-- Keep the photo exactly as the speaker submitted it (2026-10-19, Madhu): cleaning, high-res and re-uploads all rewrite photo_url / photo_processed_url,
-- so there was no way back to the original. photo_original_url is written once per submitted/uploaded photo and never touched by cleaning.
-- Backfill: for speakers that already have a photo, photo_url is the best copy of the original there is (the raw, background-intact file), so point at it.
-- Additive only.

BEGIN;

ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS photo_original_url TEXT;
UPDATE event_speakers SET photo_original_url = photo_url WHERE photo_original_url IS NULL AND photo_url IS NOT NULL;

COMMIT;
