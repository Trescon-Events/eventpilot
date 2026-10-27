-- Stage Screens (2026-10-25): for every agenda session, a transparent PNG of the speaker cards + topic that the AV team drops onto the LED wall.
-- event_screen_settings: one row per event (look of the cards).   event_screen_sessions: one row per session (last render + producer edits).
-- event_screen_links: private, no-login download links for the AV team (one per stage, or one for the whole event).
CREATE TABLE IF NOT EXISTS event_screen_settings (
  event_id        uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  font_id         uuid REFERENCES brand_fonts(id) ON DELETE SET NULL,   -- null = the font already used on the event's speaker templates
  background_url  text,                                                 -- null = the event's website-photo background
  text_color      text NOT NULL DEFAULT '#0B1F3A',
  accent_color    text NOT NULL DEFAULT '#1D4ED8',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_screen_sessions (
  session_id    uuid PRIMARY KEY REFERENCES event_agenda_sessions(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { topic?, hide_topic?, cards?: { [speakerId]: { name?, title?, company?, country? } } }
  png_url       text,
  fingerprint   text,                                  -- what the PNG was built from; differs from the live data = "changed"
  layout        text,
  width         int,
  height        int,
  low_res       text[] NOT NULL DEFAULT '{}',          -- speaker names whose photo is too small to look sharp on a big wall
  generated_at  timestamptz,
  generated_by  text
);
CREATE INDEX IF NOT EXISTS event_screen_sessions_event_idx ON event_screen_sessions(event_id);

CREATE TABLE IF NOT EXISTS event_screen_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  track_id    uuid REFERENCES event_agenda_tracks(id) ON DELETE CASCADE,   -- null = every stage
  label       text NOT NULL,
  token       text NOT NULL UNIQUE,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS event_screen_links_event_idx ON event_screen_links(event_id);

ALTER TABLE event_screen_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_screen_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_screen_links    ENABLE ROW LEVEL SECURITY;
