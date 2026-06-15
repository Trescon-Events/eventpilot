-- SmartData patch — June 2026
-- Run in SMARTDATA Supabase project (lnhtmppybqeicedgtanf)
-- Safe to run multiple times (all IF NOT EXISTS / ON CONFLICT DO NOTHING)

-- ── Saved Audiences ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sd_saved_audiences (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  final_icp_json  jsonb       NOT NULL DEFAULT '{}',
  last_run_at     timestamptz,
  results_count   int         NOT NULL DEFAULT 0,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Contact Scores ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sd_contact_scores (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid        NOT NULL REFERENCES sd_contact_records(id) ON DELETE CASCADE,
  event_id        uuid,
  score           int         NOT NULL DEFAULT 0,
  score_breakdown jsonb       NOT NULL DEFAULT '{}',
  scored_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, event_id)
);

CREATE INDEX IF NOT EXISTS sd_scores_contact_idx ON sd_contact_scores(contact_id);
CREATE INDEX IF NOT EXISTS sd_scores_event_idx   ON sd_contact_scores(event_id);

-- ── Tool Status — add email_guesser if missing ────────────────────────────────
INSERT INTO sd_tool_status (tool_key, display_name, credits_per_use, requires_api_key)
VALUES ('email_guesser', 'Email Guesser', 1, 'APOLLO_API_KEY')
ON CONFLICT (tool_key) DO NOTHING;

-- ── Enrichment Audit — ensure index exists ────────────────────────────────────
CREATE INDEX IF NOT EXISTS sd_audit_tool_idx     ON sd_enrichment_audit(source_tool, created_at DESC);
CREATE INDEX IF NOT EXISTS sd_audit_created_idx  ON sd_enrichment_audit(created_at DESC);

-- ── Contact Pipeline — ensure assigned_to is text (not uuid) -----------------
-- The pipeline UI stores staff names/emails, not UUIDs, so this may need to be
-- text if not already. Check your column type first — skip if already text.
-- ALTER TABLE sd_contact_pipeline ALTER COLUMN assigned_to TYPE text USING assigned_to::text;
