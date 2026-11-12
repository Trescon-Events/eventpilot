-- Emails module, phase 5: replies and bounces (2026-11-12). Spec: docs/build_suggestions/emails-module.md
--
-- EventPilot reads each sending producer's mailbox (Microsoft Graph, the Mail.ReadWrite application permission it already holds) for messages in the conversations it started.
-- Only the TYPE of each reply is stored (reply / bounce / auto_reply), never its text.
--
--  * email_campaign_recipients.bounce_kind     'hard' (a permanently bad address, e.g. 5.1.x) or 'soft' (a mailbox that is full, a policy rejection, a temporary failure).
--                                              Only a hard bounce marks the person's address as bounced.
--  * email_campaign_recipients.stop_requested  a reply that looks like "please remove me / stop emailing me". It is only RAISED for a producer to confirm with one click;
--                                              it never sets do-not-email by itself.
--  * email_mailbox_scans                       when each mailbox was last read, so a mailbox is read at most every ~25 minutes.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS bounce_kind TEXT;
ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS stop_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_campaign_recipients DROP CONSTRAINT IF EXISTS email_campaign_recipients_bounce_kind_check;
ALTER TABLE email_campaign_recipients ADD CONSTRAINT email_campaign_recipients_bounce_kind_check CHECK (bounce_kind IS NULL OR bounce_kind IN ('hard', 'soft'));

CREATE TABLE IF NOT EXISTS email_mailbox_scans (
  mailbox       TEXT PRIMARY KEY,
  last_scan_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error    TEXT,
  messages_seen INTEGER NOT NULL DEFAULT 0
);

COMMIT;
