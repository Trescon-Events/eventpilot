-- Show Caller: the live run-of-show sheet. One row per cue. The agenda stays the source for time, title, format and speakers (never copied here);
-- this table holds only what the show caller adds: MC, screen, live feed, mic, audio, lighting, seats, comments, actual times, plus extra rows (MC, custom).
-- Additive and safe to re-run.
CREATE TABLE IF NOT EXISTS event_showcall_cues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  track_id    uuid REFERENCES event_agenda_tracks(id) ON DELETE CASCADE,
  day         date,                                  -- custom cues only; session / MC cues take the day from their session
  kind        text NOT NULL CHECK (kind IN ('session', 'mc', 'custom')),
  session_id  uuid REFERENCES event_agenda_sessions(id) ON DELETE SET NULL,
  fields      jsonb NOT NULL DEFAULT '{}'::jsonb,    -- what the show caller types
  ack         jsonb,                                 -- the agenda details the show caller last accepted (null = new, not accepted yet)
  hidden      boolean NOT NULL DEFAULT false,        -- a removed MC row stays removed
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);
CREATE UNIQUE INDEX IF NOT EXISTS event_showcall_cues_session_kind ON event_showcall_cues (session_id, kind);   -- rows without a session (custom) never clash: NULLs are distinct
CREATE INDEX IF NOT EXISTS event_showcall_cues_event ON event_showcall_cues (event_id, track_id);
ALTER TABLE event_showcall_cues ENABLE ROW LEVEL SECURITY;

-- A private link for the show caller (no login), same table as the other screen links.
ALTER TABLE event_screen_links DROP CONSTRAINT IF EXISTS event_screen_links_kind_check;
ALTER TABLE event_screen_links ADD CONSTRAINT event_screen_links_kind_check CHECK (kind IN ('stage', 'tables', 'showcall'));
