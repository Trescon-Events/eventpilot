-- Third approval layer: "Client Approval" (2026-08-29) — per Madhu: for
-- events Trescon manages on behalf of another client (e.g. DFS/DFFW
-- events managed for DIFC), a round between Internal and External where
-- that client's own contact signs off before the speaker/sponsor round.
-- Reuses the exact same announcement_approvals table + signed-token
-- review-link machinery the external round already established (see
-- announcement_two_layer_approval_migration.sql's own comment) — only a
-- third `layer` value and a matching bypass-audit pair are needed.
--
-- Gating (app-level, not enforced here): internal AND client AND external
-- must each be resolved-approved OR bypassed before Schedule/Post Now
-- activate — see checkCanPublish in app/lib/events/postiz-publish.ts.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE announcement_approvals DROP CONSTRAINT IF EXISTS announcement_approvals_layer_check;
ALTER TABLE announcement_approvals ADD CONSTRAINT announcement_approvals_layer_check CHECK (layer IN ('internal', 'external', 'client'));

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS client_approval_bypassed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS client_approval_bypassed_at TIMESTAMPTZ;

-- The event-level client contact (2026-08-29, per Madhu — "the client here
-- will be defined in the event workspace level... one person there with
-- name, job title and email"). Only ONE contact per event, stored directly
-- as columns (same precedent as events.postiz_profile_key — a single
-- event-scoped value, not worth a dedicated table). An event with
-- client_contact_email set is what determines whether the Client Approval
-- layer even shows for that event (most events don't need it).
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_contact_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_contact_job_title TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_contact_email TEXT;

-- Own template, not a reuse of speaker_announcement_approval_request —
-- that one's wording ("Thank you for confirming your participation...")
-- is written for the speaker themselves, which doesn't fit a client
-- contact reviewing on behalf of their organization.
INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'client_announcement_approval_request',
  'Client Announcement Approval Request',
  'sae',
  'Sent to the managing client''s own contact for sign-off on an announcement before it is published — the client layer of the three-layer approval flow.',
  'Approval needed: upcoming announcement for {{event_name}}',
  '<p>Dear {{recipient_name}},</p>
<p>Ahead of publishing a new announcement for {{event_name}}, we would like to give you the opportunity to review it first. Please take a look and let us know if you are happy for us to proceed, or if you would like any changes made:</p>
<p><a href="{{review_url}}">Review the announcement &rarr;</a></p>
<p>We will hold off publishing until we hear back from you. Thank you for your time.</p>
<p>Best regards,<br/>{{sender_name}}</p>',
  '[{"key":"recipient_name","label":"Recipient Name"},{"key":"event_name","label":"Event Name"},{"key":"review_url","label":"Review Link"},{"key":"sender_name","label":"Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
