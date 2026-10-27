-- Stage Screens (2026-10-25): how big the speakers' heads are on the cards. 1 = the cleaned photo as it is; 1.4 zooms in 40% around the head.
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS head_scale numeric NOT NULL DEFAULT 1 CHECK (head_scale >= 1 AND head_scale <= 1.8);
