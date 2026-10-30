-- Stage Screens, event-day mode: what each AV link has downloaded, what a file was drawn from (to say what changed), and automatic redraw.
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS auto_redraw boolean NOT NULL DEFAULT false;   -- redraw changed screens by itself ~1 minute after the last change

ALTER TABLE event_screen_sessions ADD COLUMN IF NOT EXISTS snapshot jsonb;                  -- the content the PNG was drawn from (topic, speakers, time, stage, design)
ALTER TABLE event_screen_sessions ADD COLUMN IF NOT EXISTS stale_fingerprint text;          -- the live content a change was last noticed at
ALTER TABLE event_screen_sessions ADD COLUMN IF NOT EXISTS stale_changed_at timestamptz;    -- when that change was noticed (the quiet time counts from here)
ALTER TABLE event_screen_sessions ADD COLUMN IF NOT EXISTS redrawing_until timestamptz;     -- short lock so two pages never draw the same screen at once

ALTER TABLE event_screen_links ADD COLUMN IF NOT EXISTS baseline_at timestamptz;            -- when the AV console first downloaded anything: only changes after this raise alarms

CREATE TABLE IF NOT EXISTS event_screen_link_downloads (
  link_id        uuid NOT NULL REFERENCES event_screen_links(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL REFERENCES event_agenda_sessions(id) ON DELETE CASCADE,
  version_key    text NOT NULL,                       -- file fingerprint + schedule at the moment of download
  snapshot       jsonb,
  downloaded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, session_id)
);
ALTER TABLE event_screen_link_downloads ENABLE ROW LEVEL SECURITY;
