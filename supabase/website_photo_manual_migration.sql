-- Website photo uploaded directly (2026-10-19, Madhu): some speakers don't want their photo edited, so the team makes the website photo
-- outside EventPilot (Canva etc.) and uploads it. website_photo_manual = true means "this website photo was uploaded, not generated from the
-- cleaned photo", which lets Push to KonfHub proceed without the Clean Photo cycle. Generating a website photo sets it back to false.
-- Additive only.
BEGIN;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS website_photo_manual BOOLEAN NOT NULL DEFAULT false;
COMMIT;
