-- Agenda v3b (2026-10-05) — rooms inside a stage, roundtable sessions, and the
-- KonfHub tag mapping the adapter needs, driven by how DFS is set up on KonfHub
-- (read live 2026-10-05): one "DFS Roundtables" track whose three rooms are
-- tags in KonfHub's "Stage" filter, and session formats (Keynote / Fireside
-- Chat / Panel Discussion) are tags in its "Session Type" filter.
--
--  * event_agenda_rooms     — named rooms under a stage (a stage with rooms is
--                             shown as one timeline column per room).
--  * sessions.room_id       — which room a session is in (NULL = the stage itself).
--  * session_type 'roundtable'.
--  * event_konfhub_tag_map  — human-mapped EventPilot label <-> KonfHub tag id:
--                             kind 'format' (session format) or 'room' (room name).
--                             Same never-auto-match-by-name rule as event roles.
--  * event_agenda_tracks.konfhub_track_title — the KonfHub track title this stage
--                             publishes to (KonfHub tracks are per date, so the
--                             adapter finds/creates a track with this title for
--                             each day).
--  * events.agenda_day_start/_end — default day window (event timezone) used
--                             when the adapter has to create a KonfHub track.
-- Additive only. Applied by hand via psql.

BEGIN;

CREATE TABLE IF NOT EXISTS event_agenda_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    uuid NOT NULL REFERENCES event_agenda_tracks(id) ON DELETE CASCADE,
  name        text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, name)
);
CREATE INDEX IF NOT EXISTS idx_event_agenda_rooms_track ON event_agenda_rooms (track_id);
ALTER TABLE event_agenda_rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE event_agenda_sessions
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES event_agenda_rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_agenda_sessions_room ON event_agenda_sessions (room_id);

ALTER TABLE event_agenda_sessions DROP CONSTRAINT IF EXISTS event_agenda_sessions_session_type_check;
ALTER TABLE event_agenda_sessions ADD CONSTRAINT event_agenda_sessions_session_type_check
  CHECK (session_type IN ('speaker_session', 'lunch_break', 'refreshment_break', 'custom_session', 'workshop', 'networking', 'registration', 'roundtable'));

CREATE TABLE IF NOT EXISTS event_konfhub_tag_map (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('format', 'room')),
  label      text NOT NULL,
  tag_id     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, kind, label),
  UNIQUE (event_id, kind, tag_id)
);
ALTER TABLE event_konfhub_tag_map ENABLE ROW LEVEL SECURITY;

ALTER TABLE event_agenda_tracks ADD COLUMN IF NOT EXISTS konfhub_track_title text;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS agenda_day_start time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS agenda_day_end   time NOT NULL DEFAULT '17:00';

COMMIT;
