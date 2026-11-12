-- Emails module restructure (2026-11-12): static / active lists, drafts, pacing, personalisation fields, and the permission to send to many people.
--
--  * email_lists.list_type   'active' (criteria, recalculated every time it is used) or 'static' (the people matching at creation are copied in and stay; individuals can be added or
--                            removed by hand afterwards). members holds a static list's people as person keys: c:<contact id> | e:<email> | s:<speaker id>.
--  * email_campaign_recipients.company / role   the person's company and job title when the email was created, so {{company}} and {{role}} can be filled at send time.
--  * email_campaigns.pace_hours   when set, a big send is spread evenly over that many hours by the cron instead of going out in one burst (a single mailbox is throttled by
--                                 Microsoft and a burst of similar emails can be flagged as spam).
--  * email_campaigns.draft_state  what a draft needs that the other columns do not hold (the schedule and owner choices).
--  * sae.emails.send_bulk         the permission to send one email to more than 50 people. Every role that can edit speakers today is given it, so nothing changes until an admin
--                                 takes it away from a role (Access → Roles).
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS list_type TEXT NOT NULL DEFAULT 'active';
ALTER TABLE email_lists DROP CONSTRAINT IF EXISTS email_lists_list_type_check;
ALTER TABLE email_lists ADD CONSTRAINT email_lists_list_type_check CHECK (list_type IN ('static', 'active'));
ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS members TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS pace_hours INTEGER;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS draft_state JSONB NOT NULL DEFAULT '{}';
ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_pace_hours_check;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_pace_hours_check CHECK (pace_hours IS NULL OR (pace_hours >= 1 AND pace_hours <= 72));

INSERT INTO access_role_permissions (role_id, permission_key)
SELECT DISTINCT role_id, 'sae.emails.send_bulk' FROM access_role_permissions WHERE permission_key = 'sae.stakeholders.edit'
ON CONFLICT (role_id, permission_key) DO NOTHING;

COMMIT;
