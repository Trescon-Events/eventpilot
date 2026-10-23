-- Speaker Emails (2026-10-23): producers' free-form emails to speakers. Additive only.
--   speaker_email_batches : one compose-and-send (the body as written, whether Polish was used, the original text before Polish, attachments)
--   speaker_email_sends   : one row per speaker emailed (what was actually sent, from whom, to whom, outcome)
--   speaker_email_drafts  : a producer's unsent work, private to its author
BEGIN;
CREATE TABLE IF NOT EXISTS speaker_email_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by    text,
  body_html     text NOT NULL,
  polished      boolean NOT NULL DEFAULT false,
  original_html text,
  attachments   jsonb NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_speaker_email_batches_event ON speaker_email_batches (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS speaker_email_sends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES speaker_email_batches(id) ON DELETE CASCADE,
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id   uuid NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  sender_email text,
  sender_name  text,
  to_email     text NOT NULL,
  cc_emails    text[] NOT NULL DEFAULT '{}',
  subject      text,
  body_html    text NOT NULL,
  status       text NOT NULL CHECK (status IN ('sent', 'failed')),
  error        text,
  sent_by      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_speaker_email_sends_event ON speaker_email_sends (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_speaker_email_sends_speaker ON speaker_email_sends (speaker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_speaker_email_sends_batch ON speaker_email_sends (batch_id);

CREATE TABLE IF NOT EXISTS speaker_email_drafts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner                text NOT NULL,
  title                text NOT NULL DEFAULT '',
  recipient_speaker_ids jsonb NOT NULL DEFAULT '[]',
  body_html            text NOT NULL DEFAULT '',
  attachments          jsonb NOT NULL DEFAULT '[]',
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_speaker_email_drafts_owner ON speaker_email_drafts (event_id, owner, updated_at DESC);

ALTER TABLE speaker_email_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_email_drafts ENABLE ROW LEVEL SECURITY;
COMMIT;
