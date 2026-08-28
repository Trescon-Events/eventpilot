-- Post-publish notify flow (2026-08-27) — per Madhu: once an announcement
-- is actually live, the producer must (1) manually tag speakers/companies
-- on each platform (can't be automated — no platform exposes a tagging
-- API usable here), confirmed via a single checkbox that is BOTH the real
-- confirmation and the bypass (there is no separate "not required" toggle
-- — ticking it for any reason unlocks the next step), then (2) notify
-- internal staff (one click, templated, sent to the event's entire staff
-- roster by default) and (3) notify the external stakeholder/office
-- (editable composer, same shape as the existing external-approval flow)
-- asking them to like/share. Both notify steps track a first-sent record
-- plus a reminder counter/timestamp — "reminder" re-sends, it does not
-- reset the original record.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS tagging_confirmed_at TIMESTAMPTZ;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS tagging_confirmed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS internal_notified_at TIMESTAMPTZ;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS internal_notified_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS internal_notification_reminder_count INT NOT NULL DEFAULT 0;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS internal_notification_last_sent_at TIMESTAMPTZ;

ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notified_at TIMESTAMPTZ;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notified_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notification_reminder_count INT NOT NULL DEFAULT 0;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notification_last_sent_at TIMESTAMPTZ;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notification_recipient_name TEXT;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notification_recipient_email TEXT;
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS external_notification_cc_emails TEXT[];

-- {{platform_links}} is a pre-rendered <ul> of live post links, built
-- server-side from publish_results — not a per-platform placeholder list,
-- since the set of channels varies per announcement.
INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'publish_notification_internal',
  'Publish Notification — Internal',
  'sae',
  'Sent to the entire event staff roster the moment a producer confirms an announcement has gone live and tagging is done — asks the team to like and share.',
  '🎉 Just published: {{stakeholder_name}} — {{event_name}}',
  '<p>Hi team,</p>
<p>The {{kind_label}} for <strong>{{stakeholder_name}}</strong> ({{event_name}}) just went live. Please like and share on your own channels:</p>
{{platform_links}}
<p>Thanks!<br/>{{sender_name}}</p>',
  '[{"key":"stakeholder_name","label":"Speaker/Partner Name"},{"key":"kind_label","label":"speaker announcement / partner announcement (auto)"},{"key":"event_name","label":"Event Name"},{"key":"platform_links","label":"Published Links (auto)"},{"key":"sender_name","label":"Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO email_templates (slug, name, category, description, subject, body_html, variable_hints, sender_name, sender_email, is_active)
VALUES (
  'publish_notification_external',
  'Publish Notification — External',
  'sae',
  'Sent to the speaker/partner (or their office) once an announcement is live, politely asking them to like and share.',
  'Now live: {{stakeholder_name}}''s announcement for {{event_name}}',
  '<p>Dear {{recipient_name}},</p>
<p>Just a quick note to let you know the {{kind_label}} for {{event_name}} is now live! We would be so grateful if you could like and share it from your end:</p>
{{platform_links}}
<p>Thank you so much.</p>
<p>Best regards,<br/>{{sender_name}}</p>',
  '[{"key":"recipient_name","label":"Recipient Name"},{"key":"stakeholder_name","label":"Speaker/Partner Name"},{"key":"kind_label","label":"speaker announcement / partner announcement (auto)"},{"key":"event_name","label":"Event Name"},{"key":"platform_links","label":"Published Links (auto)"},{"key":"sender_name","label":"Sender Name"}]'::jsonb,
  'Madhukar Dudda',
  'md@tresconglobal.com',
  true
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
