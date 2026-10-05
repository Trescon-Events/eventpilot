-- Agenda v3 data model (2026-10-05) — the Agenda Builder becomes the source of
-- truth, with KonfHub as an optional adapter. Additive: nothing existing is
-- dropped, current rows keep working.
--
--  * event_agenda_sessions: draft/published status, capacity, a few more
--    generic session types, integrity checks, one session per KonfHub id.
--  * event_agenda_session_speakers: a ROLE per (session, speaker) — a person
--    can be Speaker in one session and Moderator / Roundtable Chair in
--    another. role_tag_id is an event_konfhub_roles.tag_id; '' means "the
--    speaker's own main role" (what every existing row, and a plain
--    assignment, means). PK widens to (session, speaker, role) so one person
--    can also hold two roles in the SAME session.
--  * replace_session_speakers(): atomic replace of a session's speaker list
--    (the old route deleted first then inserted, so a failed insert lost the
--    existing links) that also checks the session belongs to the event.
--
-- Event timezone lives on events.timezone (event_timezone_migration.sql);
-- session times stay UTC timestamptz. Applied by hand via psql.

BEGIN;

ALTER TABLE event_agenda_sessions
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS capacity     integer;

ALTER TABLE event_agenda_sessions DROP CONSTRAINT IF EXISTS event_agenda_sessions_status_check;
ALTER TABLE event_agenda_sessions ADD CONSTRAINT event_agenda_sessions_status_check CHECK (status IN ('draft', 'published'));

-- Legacy values stay valid; workshop / networking / registration added.
ALTER TABLE event_agenda_sessions DROP CONSTRAINT IF EXISTS event_agenda_sessions_session_type_check;
ALTER TABLE event_agenda_sessions ADD CONSTRAINT event_agenda_sessions_session_type_check
  CHECK (session_type IN ('speaker_session', 'lunch_break', 'refreshment_break', 'custom_session', 'workshop', 'networking', 'registration'));

ALTER TABLE event_agenda_sessions DROP CONSTRAINT IF EXISTS event_agenda_sessions_times_check;
ALTER TABLE event_agenda_sessions ADD CONSTRAINT event_agenda_sessions_times_check
  CHECK (start_timestamp IS NULL OR end_timestamp IS NULL OR end_timestamp > start_timestamp);

ALTER TABLE event_agenda_sessions DROP CONSTRAINT IF EXISTS event_agenda_sessions_capacity_check;
ALTER TABLE event_agenda_sessions ADD CONSTRAINT event_agenda_sessions_capacity_check CHECK (capacity IS NULL OR capacity >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_agenda_sessions_konfhub
  ON event_agenda_sessions (event_id, konfhub_session_id) WHERE konfhub_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_agenda_sessions_start ON event_agenda_sessions (event_id, start_timestamp);

ALTER TABLE event_agenda_session_speakers
  ADD COLUMN IF NOT EXISTS role_tag_id text NOT NULL DEFAULT '';
ALTER TABLE event_agenda_session_speakers DROP CONSTRAINT IF EXISTS event_agenda_session_speakers_pkey;
ALTER TABLE event_agenda_session_speakers ADD PRIMARY KEY (session_id, speaker_id, role_tag_id);

CREATE OR REPLACE FUNCTION replace_session_speakers(p_session_id uuid, p_event_id uuid, p_speakers jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM event_agenda_sessions WHERE id = p_session_id AND event_id = p_event_id) THEN
    RAISE EXCEPTION 'session % does not belong to event %', p_session_id, p_event_id USING ERRCODE = 'P0002';
  END IF;
  -- every speaker must belong to the same event
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_speakers) AS x(speaker_id uuid)
    WHERE NOT EXISTS (SELECT 1 FROM event_speakers s WHERE s.id = x.speaker_id AND s.event_id = p_event_id)
  ) THEN
    RAISE EXCEPTION 'speaker does not belong to event %', p_event_id USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM event_agenda_session_speakers WHERE session_id = p_session_id;
  INSERT INTO event_agenda_session_speakers (session_id, speaker_id, role_tag_id, order_index)
  SELECT p_session_id, x.speaker_id, COALESCE(x.role_tag_id, ''), COALESCE(x.order_index, ord::int - 1)
  FROM ROWS FROM (jsonb_to_recordset(p_speakers) AS (speaker_id uuid, role_tag_id text, order_index int)) WITH ORDINALITY AS x(speaker_id, role_tag_id, order_index, ord);
END;
$$;

COMMIT;
