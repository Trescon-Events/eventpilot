-- One Outlook thread per (event, counterpart, sender mailbox) for people who are not (yet) a speaker record: an invited speaker before
-- they submit the form, and later clients/vendors. Same mechanism as speaker_email_threads; a speaker's invite thread is adopted by their
-- speaker thread when the first speaker-facing email goes out after they appear. Additive; forward-only.
CREATE TABLE IF NOT EXISTS email_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid NOT NULL,
  scope_key             text NOT NULL,   -- e.g. 'invite:jane@x.com'
  sender_email          text NOT NULL,
  graph_message_id      text NOT NULL,
  graph_conversation_id text,
  subject               text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, scope_key, sender_email)
);
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
