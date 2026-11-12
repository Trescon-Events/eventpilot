-- Emails module, phase 2: campaigns (one named email) and one row per recipient (2026-11-12). Spec: docs/build_suggestions/emails-module.md
--
--  * email_campaigns: a named email to a list: subject, the body as sent, who it came from, attachments, status and timestamps. The audience is FROZEN into
--    email_campaign_recipients when the campaign is created, so what the preview showed is exactly what goes out.
--  * email_campaign_recipients: one row per person: To / Cc, who it is sent as, queued -> sending -> sent | failed | skipped, the Graph ids (for reply and bounce
--    tracking later) and the error if any. These rows feed the statistics.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS email_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,    -- the event it is sent from
  audience_type  TEXT NOT NULL DEFAULT 'speaker',
  template_id    UUID REFERENCES email_templates(id) ON DELETE SET NULL,   -- phase 3
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,                                            -- the body as sent (greeting and sign-off are added per person)
  polished       BOOLEAN NOT NULL DEFAULT false,
  original_html  TEXT,
  attachments    JSONB NOT NULL DEFAULT '[]',
  list_id        UUID REFERENCES email_lists(id) ON DELETE SET NULL,
  list_filters   JSONB NOT NULL DEFAULT '{}',                              -- what the audience was built from, kept for the record
  allow_assistant BOOLEAN NOT NULL DEFAULT false,
  sender_mode    TEXT NOT NULL DEFAULT 'me' CHECK (sender_mode IN ('me', 'speaker_producer')),
  sender_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  owner_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,     -- gets the reminders (phase 4)
  thread_mode    TEXT NOT NULL DEFAULT 'new' CHECK (thread_mode IN ('new', 'speaker_thread')),
  status         TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_for  TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_event ON email_campaigns(event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  speaker_id      UUID REFERENCES event_speakers(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  greeting_name   TEXT,                       -- who the email is addressed to (the speaker, or the assistant when sent through one)
  pronoun_style   TEXT,
  mode            TEXT NOT NULL DEFAULT 'own' CHECK (mode IN ('own', 'assistant')),
  to_email        TEXT NOT NULL,
  cc_emails       TEXT[] NOT NULL DEFAULT '{}',
  sender_email    TEXT,
  sender_name     TEXT,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason     TEXT,
  error           TEXT,
  claimed_at      TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  graph_message_id TEXT,
  conversation_id TEXT,
  reply_type      TEXT NOT NULL DEFAULT 'none' CHECK (reply_type IN ('none', 'reply', 'bounce', 'auto_reply')),
  reply_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign ON email_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_contact ON email_campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_conv ON email_campaign_recipients(conversation_id) WHERE conversation_id IS NOT NULL;

COMMIT;
