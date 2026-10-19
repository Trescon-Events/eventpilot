-- VIP photos (2026-10-19, Madhu): VIPs get the same photo upload + Clean Photo cycle as speakers (for badges). The speaker photo routes serve
-- VIPs via ?kind=vip, so event_vips gets the same photo columns and the AI Fill job table can point at a VIP instead of a speaker.
-- event_vips.photo_url = the raw (background-intact) upload, photo_processed_url = the cleaned cutout the badge uses.
-- Additive only.
BEGIN;
ALTER TABLE event_vips ADD COLUMN IF NOT EXISTS photo_processed_url TEXT;
ALTER TABLE event_vips ADD COLUMN IF NOT EXISTS photo_low_resolution BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE event_vips ADD COLUMN IF NOT EXISTS photo_cleaning_cycle_done BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE speaker_photo_clean_jobs ALTER COLUMN speaker_id DROP NOT NULL;
ALTER TABLE speaker_photo_clean_jobs ADD COLUMN IF NOT EXISTS vip_id UUID REFERENCES event_vips(id) ON DELETE CASCADE;
ALTER TABLE speaker_photo_clean_jobs DROP CONSTRAINT IF EXISTS speaker_photo_clean_jobs_subject_chk;
ALTER TABLE speaker_photo_clean_jobs ADD CONSTRAINT speaker_photo_clean_jobs_subject_chk CHECK ((speaker_id IS NOT NULL) <> (vip_id IS NOT NULL));
COMMIT;
