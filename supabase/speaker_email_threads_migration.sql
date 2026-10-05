-- One Outlook thread per (speaker, sender mailbox). EventPilot speaker-facing
-- emails are sent through Microsoft Graph as the producer; the first send is
-- created as a draft+send so we get a message id, and every later send is a
-- reply on that message so all of a speaker's communications thread together.
-- Forward-only: no backfill, existing speakers get a thread on their next send.
CREATE TABLE IF NOT EXISTS speaker_email_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id            uuid NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  event_id              uuid NOT NULL,
  sender_email          text NOT NULL,
  graph_message_id      text NOT NULL,   -- immutable id of the first message in the thread
  graph_conversation_id text,
  subject               text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (speaker_id, sender_email)
);
ALTER TABLE speaker_email_threads ENABLE ROW LEVEL SECURITY;
