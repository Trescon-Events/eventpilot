-- Agenda Builder: backup of every session deleted from EventPilot, including its KonfHub copy (2026-10-18). A KonfHub delete cannot be undone, so the full record
-- (EventPilot row, speakers, and KonfHub's own session JSON) is stored before the delete is sent. Additive only.
begin;
CREATE TABLE IF NOT EXISTS event_agenda_deleted_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  session_id uuid,
  konfhub_session_id text,
  title text,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_on_konfhub boolean NOT NULL DEFAULT false,
  ep_session jsonb,
  ep_speakers jsonb,
  konfhub_session jsonb
);
CREATE INDEX IF NOT EXISTS event_agenda_deleted_sessions_event_idx ON event_agenda_deleted_sessions (event_id, deleted_at DESC);
ALTER TABLE event_agenda_deleted_sessions ENABLE ROW LEVEL SECURITY;
commit;
