-- Guest invite send log (2026-10-06): one row per invite/reminder email sent (or failed), single or
-- bulk, so producers have a permanent record even when the same speaker is emailed several times.
-- Additive only. The event_speakers counters stay (Status Board reads them).
BEGIN;
CREATE TABLE IF NOT EXISTS guest_invite_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id  uuid NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('guest_invite', 'guest_invite_reminder')),
  to_email    text NOT NULL,
  cc_emails   text[] NOT NULL DEFAULT '{}',
  subject     text,
  status      text NOT NULL CHECK (status IN ('sent', 'failed')),
  error       text,
  used_at_send integer,
  limit_at_send integer,
  bulk_batch_id uuid,
  sent_by     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_invite_sends_event ON guest_invite_sends (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_invite_sends_speaker ON guest_invite_sends (speaker_id, created_at DESC);
ALTER TABLE guest_invite_sends ENABLE ROW LEVEL SECURITY;
COMMIT;
