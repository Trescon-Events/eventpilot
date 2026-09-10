-- Speaker Communications (2026-09-10) — a per-speaker "request outstanding
-- items" flow: a producer picks what's still missing (Full Bio, Photo,
-- Passport, National ID), the system emails the speaker a unique link, the
-- speaker fills/uploads just those items on a no-login page, and the data
-- lands directly back into their EXISTING event_speakers record (never a
-- new one). Modeled directly on announcement_approvals (supabase/
-- sae_migration.sql) — single-use expiring token, status-driven "already
-- actioned" lock read fresh on every page load, not a stakeholder_invites-
-- style non-expiring/attribution-only token.
--
-- requested_fields is a snapshot of what was asked for AT SEND TIME (e.g.
-- ["bio_full","passport"]) — deliberately not recomputed live, so the
-- speaker's form always matches what the email said, even if the producer
-- requests something else again later (a fresh row, not a mutation of this
-- one — see "Request Again" in the Communications tab).
--
-- reminder_count/last_reminder_at are actually incremented by the remind
-- route (mirrors notify-external/remind's working pattern), unlike the
-- same-named-but-dead columns on stakeholder_invites.
--
-- Run manually via the Supabase session-pooler psql connection — this repo
-- has no migration runner, all files under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS speaker_communication_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id        UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  requested_fields  JSONB NOT NULL,
  token             TEXT NOT NULL UNIQUE,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'closed')),
  actual_subject    TEXT,
  actual_body_html  TEXT,
  submitted_data    JSONB,
  requested_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at      TIMESTAMPTZ,
  reminder_count    INT NOT NULL DEFAULT 0,
  last_reminder_at  TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_speaker_comm_requests_speaker ON speaker_communication_requests(speaker_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_speaker_comm_requests_token   ON speaker_communication_requests(token);

-- Sent to the speaker with a personal link listing exactly what's still
-- outstanding. Sender defaults mirror the existing SAE templates (real
-- fallback mailbox values, not placeholders — Graph app-only sending needs
-- a genuine tenant mailbox if resolveSenderIdentity() ever falls back to
-- them).
INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'speaker_outstanding_items_request',
  'Speaker Outstanding Items Request',
  'sae',
  'Sent to a speaker listing exactly what''s still missing (Bio, Photo, Passport, National ID), with a personal link to submit just those items.',
  'A quick follow-up for your participation — {{event_name}}',
  '<p>Dear {{speaker_name}},</p>
<p>Thank you again for confirming your participation in {{event_name}}. To finish setting up your speaker profile, we still need the following from you:</p>
{{missing_items_list}}
<p>You can submit these securely here — it only takes a couple of minutes:</p>
<p><a href="{{submission_link}}">Submit your details &rarr;</a></p>
<p>Thank you for your time.</p>
<p>Best regards,<br/>{{producer_name}}</p>',
  '[{"key":"speaker_name","label":"Speaker Name"},{"key":"event_name","label":"Event Name"},{"key":"missing_items_list","label":"Missing Items List"},{"key":"submission_link","label":"Submission Link"},{"key":"producer_name","label":"Producer/Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Short closing note once a producer has manually verified everything
-- submitted is good — deliberately brief, this is a "thank you, you're all
-- set" note, not another action-required email.
INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'speaker_outstanding_items_ack',
  'Speaker Outstanding Items Acknowledgment',
  'sae',
  'Short thank-you sent once a producer has verified everything requested from a speaker has been received.',
  'All set — thank you, {{speaker_name}}!',
  '<p>Dear {{speaker_name}},</p>
<p>Thank you — we have received and reviewed everything we needed for {{event_name}}. Nothing further is required from you at this stage.</p>
<p>We really appreciate your time and look forward to having you with us.</p>
<p>Best regards,<br/>{{producer_name}}</p>',
  '[{"key":"speaker_name","label":"Speaker Name"},{"key":"event_name","label":"Event Name"},{"key":"producer_name","label":"Producer/Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
