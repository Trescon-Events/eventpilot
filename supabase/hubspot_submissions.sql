-- ============================================================
-- HUBSPOT SUBMISSION SOURCE (2026-08-11) — additive columns only.
-- stakeholder_form_submissions is reused as-is for HubSpot-sourced
-- rows (submitted_data/file_urls are already freeform JSONB, nothing
-- about the table assumes "came from our own form"). `source`
-- distinguishes the two origins for the Submissions Inbox UI.
-- `hubspot_submission_key` is a content-hash used to dedupe HubSpot
-- Workflow webhook retries within a short window (see
-- app/api/public/hubspot/submissions/route.ts) — HubSpot doesn't
-- expose a reliable native submission ID as a Workflow token.
-- ============================================================

ALTER TABLE stakeholder_form_submissions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'native_form' CHECK (source IN ('native_form', 'hubspot')),
  ADD COLUMN IF NOT EXISTS hubspot_submission_key TEXT;

CREATE INDEX IF NOT EXISTS idx_stakeholder_form_submissions_hs_dedupe
  ON stakeholder_form_submissions(hubspot_submission_key, submitted_at);
