-- Speaker Outstanding Items Request — highlighted list + button link
-- (2026-09-24). The original template (speaker_communication_requests_
-- migration.sql) had no inline styling at all on the missing-items list or
-- the "Submit your details" link — fine for a real email client's default
-- rendering, but illegible when the admin Communications tab's Preview
-- rendered the same raw HTML inside this app's own dark, Tailwind-reset
-- page (see CommunicationsTab.tsx's iframe-preview fix, same change).
-- Requested-items <li> styling now lives inline in compose/route.ts and
-- remind/route.ts (built fresh per send, not stored in this template row),
-- so only the "Submit your details" link needs updating here. Run manually
-- via the Supabase session-pooler psql connection, like every other file
-- under supabase/ — this repo has no migration runner.

UPDATE email_templates
SET body_html = '<p>Dear {{speaker_name}},</p>
<p>Thank you again for confirming your participation in {{event_name}}. To finish setting up your speaker profile, we still need the following from you:</p>
{{missing_items_list}}
<p>You can submit these securely here — it only takes a couple of minutes:</p>
<p><a href="{{submission_link}}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Submit your details &rarr;</a></p>
<p>Thank you for your time.</p>
<p>Best regards,<br/>{{producer_name}}</p>'
WHERE slug = 'speaker_outstanding_items_request';
