-- Stage Screens: a link is either for the stage graphics (the AV console) or for the Table Screens (the technician). Additive; every existing link stays a stage link.
ALTER TABLE event_screen_links ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stage';
ALTER TABLE event_screen_links DROP CONSTRAINT IF EXISTS event_screen_links_kind_check;
ALTER TABLE event_screen_links ADD CONSTRAINT event_screen_links_kind_check CHECK (kind IN ('stage', 'tables'));
