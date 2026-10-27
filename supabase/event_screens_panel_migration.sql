-- Stage Screens (2026-10-25): which kind of panel the graphic sits on — 'light' (white centre panel, dark text) or 'dark' (dark panel, light text).
-- Only changes the text colours used when drawing and the colour the previews are shown on; the exported PNG is always transparent.
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS panel text NOT NULL DEFAULT 'light' CHECK (panel IN ('light', 'dark'));
