-- Stage Screens design 2 now uses a "Stage Screen Card" template built in the template editor; this records which one an event picked.
-- (The earlier card_design column is no longer used by the app and can stay as it is.)
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS card_variant_id text;
