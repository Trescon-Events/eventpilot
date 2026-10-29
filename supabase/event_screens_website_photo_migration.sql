-- Stage Screens: draw each speaker's photo with the event's own Website Photo template (background, aligned photo, any design layer on top)
-- instead of a plain background, so the screens match the website without rebuilding the design.
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS use_website_photo boolean NOT NULL DEFAULT false;
