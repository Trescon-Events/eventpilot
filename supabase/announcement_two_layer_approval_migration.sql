-- Two-layer announcement approval (2026-08-26) — per Madhu: an INTERNAL
-- round (existing event_staff approvers, unchanged) and a new EXTERNAL
-- round (the speaker themselves and/or their office/assistant, who have no
-- EventPilot login). Both rounds reuse the existing announcement_approvals
-- table + its signed-token/no-login-review-link machinery rather than a
-- parallel structure — only a `layer` column and a few nullable
-- external-contact columns are needed.
--
-- Each round is independently bypassable (checkbox in the UI, e.g.
-- "Internal approval not required") — stakeholder_announcements gets a
-- bypassed_by/bypassed_at pair per layer, for audit ("who decided to skip
-- this, and when"), distinct from a real approval having happened.
--
-- Gating (app-level, not enforced here): Schedule/Post Now/Send-to-Speaker
-- become available once internal is resolved-approved OR bypassed, AND
-- (no external round was ever started, OR external resolved-approved, OR
-- external was bypassed). An announcement that never touches the external
-- flow at all behaves exactly as before this migration.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE announcement_approvals ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'internal' CHECK (layer IN ('internal', 'external'));
ALTER TABLE announcement_approvals ALTER COLUMN approver_id DROP NOT NULL;
ALTER TABLE announcement_approvals ADD COLUMN IF NOT EXISTS external_name TEXT;
ALTER TABLE announcement_approvals ADD COLUMN IF NOT EXISTS external_email TEXT;
ALTER TABLE announcement_approvals ADD COLUMN IF NOT EXISTS cc_emails TEXT[];

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS internal_approval_bypassed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS internal_approval_bypassed_at TIMESTAMPTZ;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_approval_bypassed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_approval_bypassed_at TIMESTAMPTZ;

-- Short, polite template for the external round — thanks the speaker for
-- confirming participation first, then asks for a quick look before it
-- goes out publicly. {{review_url}} is a signed, no-login link (same
-- announcement_approvals.approval_token mechanism the internal round
-- already uses). Sender defaults mirror the two existing SAE templates
-- (speaker_onboarding_invite, speaker_self_promo_request) — real fallback
-- values, not placeholders, since Graph app-only sending needs a genuine
-- tenant mailbox if resolveSenderIdentity() ever falls back to them.
INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'speaker_announcement_approval_request',
  'Speaker Announcement Approval Request',
  'sae',
  'Sent to a speaker or their office for sign-off on an announcement before it is published — the external layer of the two-layer approval flow.',
  'Quick approval needed: your announcement for {{event_name}}',
  '<p>Dear {{recipient_name}},</p>
<p>Thank you again for confirming your participation in {{event_name}} — we are really looking forward to having {{speaker_name}} join us.</p>
<p>Before we share the news publicly, we would love for you to take a quick look at the announcement we would like to post. Please review it here and let us know if you are happy for us to go ahead, or if you would like any changes made first:</p>
<p><a href="{{review_url}}">Review the announcement &rarr;</a></p>
<p>We will hold off publishing until we hear back from you. Thank you so much for your time.</p>
<p>Best regards,<br/>{{sender_name}}</p>',
  '[{"key":"recipient_name","label":"Recipient Name"},{"key":"speaker_name","label":"Speaker Name"},{"key":"event_name","label":"Event Name"},{"key":"review_url","label":"Review Link"},{"key":"sender_name","label":"Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
