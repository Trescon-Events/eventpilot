-- Super Admin: Platform-Wide Read-Only AI Access API (2026-09-29, per Madhu)
-- See docs/build_suggestions/ (or plan history) for the full design.
--
-- Generalizes content_guideline_tokens (single-event, single-purpose) into
-- a platform-wide, multi-domain, multi-event token with a real request log
-- — Content Guidelines deliberately skipped a log ("avoids an unbounded
-- log"); this one needs one, since "what was requested" tracking is an
-- explicit requirement here.

CREATE TABLE IF NOT EXISTS platform_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  -- Subset of: 'event_overview', 'speakers_partners', 'agenda',
  -- 'documents_reports', 'news_and_intel' — validated in app code, not a
  -- DB constraint, so a new domain can be added without a migration.
  domains text[] NOT NULL DEFAULT '{}',
  event_scope text NOT NULL DEFAULT 'all' CHECK (event_scope IN ('all', 'specific')),
  event_ids uuid[],
  created_by uuid REFERENCES staff_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES staff_members(id),
  rate_window_started_at timestamptz,
  rate_window_count int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS platform_api_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES platform_api_tokens(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  domain text NOT NULL,
  event_id uuid,
  query_summary text,
  result_count int,
  status_code int NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_api_access_log_token ON platform_api_access_log (token_id, requested_at DESC);
