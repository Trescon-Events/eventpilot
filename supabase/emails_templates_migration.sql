-- Emails module, phase 3: templates (2026-11-12). Spec: docs/build_suggestions/emails-module.md
--
-- The existing email_templates table is extended, not replaced. Templates made for the Emails module have audience_type 'speaker' and kind NULL (the existing per-event
-- guest-invite templates use kind + event_id, with a unique index on that pair; a NULL kind never collides with it). They hold only the BODY of an email: the greeting and
-- the sign-off are added per person when it is sent, and the sender comes from the campaign, so the old sender columns are filled with a placeholder and unused.
--
--  * audience_type          'speaker' for Emails-module templates; NULL for every older template (those stay where they are, shown read-only in the module).
--  * required_fields        [{ key, label, kind: 'url' | 'text' }]: a required field blocks sending until it is filled (the thank-you template's gallery link).
--  * event_id               NULL = a shared template (admins edit); set = a copy customised for that one event (producers edit).
--  * parent_template_id     the shared template an event copy was made from.
--  * default_sender_mode    'me' | 'speaker_producer': what Compose preselects for this template.
--  * default_audience       'confirmed' | 'spoke' | 'confirmed_or_spoke': what Compose preselects.
--  * email_campaigns.field_values: the values given for the template's required fields when the email was created.
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS audience_type TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '[]';
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS parent_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS allow_assistant BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS default_sender_mode TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS default_audience TEXT;

ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_default_sender_mode_check;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_default_sender_mode_check CHECK (default_sender_mode IS NULL OR default_sender_mode IN ('me', 'speaker_producer'));
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_default_audience_check;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_default_audience_check CHECK (default_audience IS NULL OR default_audience IN ('confirmed', 'spoke', 'confirmed_or_spoke'));
CREATE INDEX IF NOT EXISTS idx_email_templates_audience ON email_templates(audience_type, is_active) WHERE audience_type IS NOT NULL;

ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS field_values JSONB NOT NULL DEFAULT '{}';

-- Two shared starting points. {{event_name}}, {{event_dates}} and {{event_venue}} come from the event the email is sent from; {{speaker_name}} and {{first_name}} from each
-- person; {{gallery_link}} is a required field. Admins edit these; a producer customises a copy for their event.
INSERT INTO email_templates (slug, name, description, category, subject, body_html, variable_hints, sender_name, sender_email, is_active, audience_type, is_shared, required_fields, default_sender_mode, default_audience)
VALUES (
  'emails-thank-you', 'Thank you after the event',
  'Thanks the speakers and shares the photo gallery. The gallery link is required: nothing can be sent without it. Goes out from each speaker''s own producer.',
  'emails', 'Thank you for being part of {{event_name}}',
  '<p>On behalf of the {{event_name}} team, thank you for your time, insights and participation. Your contribution enriched the discussions and added real value for our audience.</p><p>We hope the event was a meaningful experience for you. As we build on this edition, we would greatly appreciate any feedback or suggestions that would help us strengthen future editions.</p><p>The first photographs from the event are in the gallery here: <a href="{{gallery_link}}">{{gallery_link}}</a>. More images will be added over the coming days.</p><p>Thank you once again for your valuable contribution. We look forward to staying connected and to working together again.</p>',
  '[]', 'EventPilot', 'noreply@eventpilot.tresconglobal.com', true, 'speaker', true,
  '[{"key":"gallery_link","label":"Photo gallery link","kind":"url"}]', 'speaker_producer', 'confirmed_or_spoke'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO email_templates (slug, name, description, category, subject, body_html, variable_hints, sender_name, sender_email, is_active, audience_type, is_shared, required_fields, default_sender_mode, default_audience)
VALUES (
  'emails-invite-past-speakers', 'Invite past speakers to a new event',
  'A short invitation for people who spoke at an earlier event. Uses the event''s public dates and venue, so set those first. Edit the wording to suit the event.',
  'emails', 'Invitation to speak at {{event_name}}',
  '<p>It was a pleasure to have you with us at one of our earlier events, and we would be delighted to welcome you again.</p><p>We are now preparing {{event_name}}, taking place {{event_dates}} at {{event_venue}}. We believe your perspective would add a great deal, and we would like to invite you to join us as a speaker.</p><p>If you are interested, please reply to this email and I will share the details. We would be glad to find the right session for you.</p><p>Thank you for your time and consideration.</p>',
  '[]', 'EventPilot', 'noreply@eventpilot.tresconglobal.com', true, 'speaker', true,
  '[]', 'me', NULL
) ON CONFLICT (slug) DO NOTHING;

COMMIT;
