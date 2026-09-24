-- Speaker Announcement Approval Request — "kind note" (2026-09-24).
-- With hundreds of speakers to announce and limited channel slots, approval
-- doesn't guarantee publication. Appends a small, muted (still legible)
-- note to the template row managed in Admin > Email Templates. Appended
-- (not replaced) so any edits already made in that UI are kept, and
-- idempotent so re-running it doesn't add a second copy. Run manually via
-- the Supabase session-pooler psql connection, like every file here.

UPDATE email_templates
SET body_html = body_html || '
<p style="margin-top:24px;font-size:12px;line-height:1.5;color:#6b7280;"><strong>A kind note:</strong> Thank you for taking the time to review this. As we&#39;re welcoming a large speaker line-up, we&#39;re sharing announcements in phases across our channels, and not every post may be featured. Your approval helps us keep it ready to go whenever a slot opens up. Thank you for your understanding and support.</p>'
WHERE slug = 'speaker_announcement_approval_request'
  AND body_html NOT LIKE '%A kind note:%';
