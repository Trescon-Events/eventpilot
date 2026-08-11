-- ============================================================
-- STAKEHOLDER INVITES (2026-08-09) — Phase 3 of the SAE
-- producer-workflow initiative. One row per "producer invited this
-- specific person to submit the onboarding form." Mirrors
-- announcement_approvals' signed-token shape, but the recipient is
-- an external, prospective speaker/partner with no staff_members
-- row — plain-text recipient_name/recipient_email instead of an
-- approver_id FK.
--
-- Lifecycle is intentionally lean: a row is only ever created at
-- actual SEND time (see app/api/events/stakeholders/invites/send),
-- never when the compose panel opens. That means there is no
-- 'draft-abandoned' status and nothing to garbage-collect —
-- 'draft' here only ever means "a send attempt failed and is
-- retryable," never a pre-send state.
--
-- No token_expires_at — invite_token is attribution-only (who did
-- we invite, did they submit), never an access gate on the public
-- form itself (which is unauthenticated regardless). Nothing ever
-- enforces expiry, so there's nothing to add.
-- ============================================================

CREATE TABLE IF NOT EXISTS stakeholder_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  form_type         TEXT NOT NULL CHECK (form_type IN ('speaker', 'sponsor', 'media_partner', 'association_partner')),
  template_id       UUID NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,
  recipient_name    TEXT NOT NULL,
  recipient_email   TEXT NOT NULL,
  invite_token      TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'submitted')),
  actual_subject    TEXT NOT NULL,          -- what was ACTUALLY sent — may differ from the template if the producer edited it
  actual_body_html  TEXT NOT NULL,
  send_error        TEXT,
  submission_id     UUID REFERENCES stakeholder_form_submissions(id) ON DELETE SET NULL,
  sent_by           UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  sent_at           TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  reminder_count    INT NOT NULL DEFAULT 0,
  last_reminder_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stakeholder_invites_event_form ON stakeholder_invites(event_id, form_type, status);
CREATE INDEX IF NOT EXISTS idx_stakeholder_invites_token      ON stakeholder_invites(invite_token);

-- Links a submission back to the invite that produced it (nullable —
-- most submissions, forever, have no invite: organic/manual link shares).
ALTER TABLE stakeholder_form_submissions
  ADD COLUMN IF NOT EXISTS invite_id UUID REFERENCES stakeholder_invites(id) ON DELETE SET NULL;
