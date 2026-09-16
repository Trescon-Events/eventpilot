-- Content Guidelines API (2026-09-16) — see
-- ~/Downloads/EventPilot_Content_Guidelines_API_Spec.md. Bearer tokens that
-- let an external agent (Antigravity, working in the AI InfraNext site
-- repo) fetch one event's approved messaging/style-guide/production-pack
-- guidance from GET /api/public/v1/content-guidelines, and call the
-- existing (now auth-gated) content/validate route, without an EventPilot
-- session.
--
-- Deviates from the spec's literal table SQL in two ways, matched to this
-- codebase's actual schema rather than the spec's generic template:
--   - created_by references staff_members(id), not a nonexistent
--     `profiles` table — every other *_tokens/created_by column in this
--     repo (access_rbac.sql, core_schema.sql, etc.) points at
--     staff_members, and session.sid (see app/lib/access/session.ts) IS a
--     staff_members id.
--   - rate_window_started_at / rate_window_count implement the spec's
--     "60 requests per hour per token" cap directly on the row (reset
--     when the hour window has elapsed) rather than a separate request-log
--     table — cheap enough at "ample" volume and avoids an unbounded log.

CREATE TABLE IF NOT EXISTS content_guideline_tokens (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_hash              TEXT NOT NULL UNIQUE,
  label                   TEXT,
  created_by              UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at            TIMESTAMPTZ,
  revoked_at              TIMESTAMPTZ,
  rate_window_started_at  TIMESTAMPTZ,
  rate_window_count       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_content_guideline_tokens_event_id ON content_guideline_tokens(event_id);
