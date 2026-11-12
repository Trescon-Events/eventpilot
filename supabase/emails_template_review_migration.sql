-- Emails module: template review (2026-11-12). A template's wording can drift from an event's messaging doc, so before a template is used for an event a person must confirm it is still
-- accurate FOR THAT EVENT. The confirmation records the version of the template text and of the event's compiled reference (event_compiled_reference, regenerated whenever the event's or
-- its umbrella's messaging doc is approved) it was checked against. It goes stale when either changes, or after 90 days.
--
--  * email_template_reviews     one row per (template, event): who confirmed it, when, against which template text and reference version.
--  * email_campaigns.template_review   what an email was created from: { by, at, reference_version } (so Emails can say "template reviewed by Simran on 11 Nov").
--  * email_campaigns.template_nudged_at   when the owner of a scheduled email was last told its template went stale (at most once a week).
--
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS email_template_reviews (
  template_id         UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reviewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by         TEXT,
  reference_version   INTEGER,                 -- event_compiled_reference.version at the time (NULL = the event had none)
  template_updated_at TIMESTAMPTZ,             -- email_templates.updated_at of the text that was reviewed
  PRIMARY KEY (template_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_email_template_reviews_event ON email_template_reviews(event_id);

ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS template_review JSONB;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS template_nudged_at TIMESTAMPTZ;

COMMIT;
