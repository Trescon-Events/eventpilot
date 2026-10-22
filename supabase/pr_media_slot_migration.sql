-- PR & Media (2026-10-23): each media day gets a slot length (30 or 60 min). The speaker form splits the day's range into slots of that length.
-- Additive; existing rows keep the old hourly behaviour (60).
ALTER TABLE event_media_days ADD COLUMN IF NOT EXISTS slot_minutes INTEGER NOT NULL DEFAULT 60 CHECK (slot_minutes IN (30, 60));
