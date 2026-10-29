-- Stage Screens design 2 ("card"): the branding layers, card size and text settings for the composed card, per event.
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS card_design jsonb NOT NULL DEFAULT '{}'::jsonb;
