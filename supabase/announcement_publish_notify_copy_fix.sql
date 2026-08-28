-- Patch (2026-08-28) — announcement_publish_notify_migration.sql already
-- ran (ON CONFLICT DO NOTHING), so its updated body_html/variable_hints
-- for the two publish_notification templates never reached the existing
-- rows. Per Madhu: the external email should say "the speaker/partner
-- announcement for X" rather than just "the announcement for X" — adds a
-- {{kind_label}} token (resolved server-side per announcement) to both
-- templates.

BEGIN;

UPDATE email_templates
SET body_html = '<p>Hi team,</p>
<p>The {{kind_label}} for <strong>{{stakeholder_name}}</strong> ({{event_name}}) just went live. Please like and share on your own channels:</p>
{{platform_links}}
<p>Thanks!<br/>{{sender_name}}</p>',
    variable_hints = '[{"key":"stakeholder_name","label":"Speaker/Partner Name"},{"key":"kind_label","label":"speaker announcement / partner announcement (auto)"},{"key":"event_name","label":"Event Name"},{"key":"platform_links","label":"Published Links (auto)"},{"key":"sender_name","label":"Sender Name"}]'::jsonb,
    updated_at = NOW()
WHERE slug = 'publish_notification_internal';

UPDATE email_templates
SET body_html = '<p>Dear {{recipient_name}},</p>
<p>Just a quick note to let you know the {{kind_label}} for {{event_name}} is now live! We would be so grateful if you could like and share it from your end:</p>
{{platform_links}}
<p>Thank you so much.</p>
<p>Best regards,<br/>{{sender_name}}</p>',
    variable_hints = '[{"key":"recipient_name","label":"Recipient Name"},{"key":"stakeholder_name","label":"Speaker/Partner Name"},{"key":"kind_label","label":"speaker announcement / partner announcement (auto)"},{"key":"event_name","label":"Event Name"},{"key":"platform_links","label":"Published Links (auto)"},{"key":"sender_name","label":"Sender Name"}]'::jsonb,
    updated_at = NOW()
WHERE slug = 'publish_notification_external';

COMMIT;
