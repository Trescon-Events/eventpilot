-- Staff Portal event core fields (2026-11-11)
--
-- Why: three different dates were being confused. events.event_date / end_date are the PROJECT dates (staff allocation, from the Staff Portal);
-- actual_start_date / actual_end_date are the real EVENT days (now also from the Staff Portal); public_dates_display is the text shown on
-- materials (auto-filled from the event days, then editable). This adds the places to keep the coordinator link, the last auto-filled public
-- dates (so we know whether a person has since edited them) and when each record was last refreshed from the Staff Portal.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS sp_coordinator_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sp_coordinator_name     TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_dates_auto       TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sp_refreshed_at         TIMESTAMPTZ;

ALTER TABLE event_umbrellas ADD COLUMN IF NOT EXISTS sp_refreshed_at TIMESTAMPTZ;

COMMIT;
