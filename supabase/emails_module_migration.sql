-- Emails module, phase 1: people + lists (2026-11-11). Spec: docs/build_suggestions/emails-module.md
--
--  * crm_contacts gains the do-not-email flag (with reason, source, who and when) and an email_status (ok / bounced / invalid / review),
--    so a bulk list can leave out people who asked to stop or whose address bounces. These come only from EventPilot's own one-to-one Outlook
--    emails: set by a producer ('manual'), or raised from a reply or a delivery failure to an EventPilot email ('reply'). HubSpot's marketing
--    opt-outs and bounces are deliberately NOT used: HubSpot sends a different kind of email for a different purpose.
--  * crm_contact_dne_log: every set / clear, with who and why.
--  * email_lists: saved audiences (filters + hand-picked and hand-removed people). A list is resolved to recipients when it is used.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS dne_reason TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS dne_source TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS dne_set_by TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS dne_set_at TIMESTAMPTZ;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS email_status_source TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS email_status_at TIMESTAMPTZ;
ALTER TABLE crm_contacts DROP COLUMN IF EXISTS hubspot_flags_checked_at;   -- an earlier draft of this migration added it; not used

ALTER TABLE crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_dne_reason_check;
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_dne_reason_check
  CHECK (dne_reason IS NULL OR dne_reason = ANY (ARRAY['asked_to_stop', 'bounced', 'left_company', 'client_request', 'other']));
ALTER TABLE crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_dne_source_check;
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_dne_source_check
  CHECK (dne_source IS NULL OR dne_source = ANY (ARRAY['manual', 'reply']));
ALTER TABLE crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_email_status_check;
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_email_status_check
  CHECK (email_status = ANY (ARRAY['ok', 'bounced', 'invalid', 'review']));
CREATE INDEX IF NOT EXISTS idx_crm_contacts_dne ON crm_contacts(do_not_email) WHERE do_not_email;

CREATE TABLE IF NOT EXISTS crm_contact_dne_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  action     TEXT NOT NULL CHECK (action IN ('set', 'cleared')),
  reason     TEXT,
  source     TEXT NOT NULL DEFAULT 'manual',
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contact_dne_log_contact ON crm_contact_dne_log(contact_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS email_lists (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  audience_type        TEXT NOT NULL DEFAULT 'speaker',
  filters              JSONB NOT NULL DEFAULT '{}',
  pinned_contact_ids   UUID[] NOT NULL DEFAULT '{}',
  excluded_contact_ids UUID[] NOT NULL DEFAULT '{}',
  allow_assistant      BOOLEAN NOT NULL DEFAULT false,
  event_id             UUID REFERENCES events(id) ON DELETE CASCADE,   -- NULL = usable from any event
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_lists_event ON email_lists(event_id);

COMMIT;
