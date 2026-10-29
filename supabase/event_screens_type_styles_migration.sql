-- Stage Screens: per-element text styling (font, weight, size, colour, capitals) for topic, moderator tag, name, title, company and country, per event.
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS type_styles jsonb NOT NULL DEFAULT '{}'::jsonb;
