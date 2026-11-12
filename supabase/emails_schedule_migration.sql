-- Emails module, phase 4: scheduling and owner reminders (2026-11-12). Spec: docs/build_suggestions/emails-module.md
--
--  * A scheduled campaign (status 'scheduled') keeps its audience DEFINITION (list or filters, hand-removed and hand-picked people) and works out who receives it when it is
--    released, not when it was written: a thank-you scheduled before the event ends must reach the people who actually spoke, and the post-event prompt marks Spoke / No-show
--    only afterwards. recipient_count on a scheduled campaign is an estimate until then.
--  * timezone: the event's timezone the send time was chosen in (scheduled_for itself is a UTC instant).
--  * last_reminder_at / heads_up_sent_at / summary_sent_at: so the owner is reminded at most once a day, told once before a send, and told once what happened.
--  * events.email_owner_staff_id: the one producer who owns post-event emails for the event (gets the reminders). Each campaign can still name its own owner.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS audience_pinned   UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS audience_excluded UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS timezone          TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS last_reminder_at  TIMESTAMPTZ;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS heads_up_sent_at  TIMESTAMPTZ;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS summary_sent_at   TIMESTAMPTZ;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS released_at       TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_email_campaigns_due ON email_campaigns(scheduled_for) WHERE status = 'scheduled';

ALTER TABLE events ADD COLUMN IF NOT EXISTS email_owner_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;

COMMIT;
