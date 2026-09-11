-- Reference Documents & Content Validation — Stage 3: deterministic
-- validation (2026-09-10). See
-- docs/build_suggestions/reference-documents-and-validation.md.

-- Deterministic rules a producer/CMD attaches at umbrella or event level —
-- an event's effective rule set is its own active rules plus its
-- umbrella's (same depth-2 walk as resolve-reference-docs.ts). Checked by
-- app/lib/content/validate.ts, pure and synchronous, no model call.
CREATE TABLE IF NOT EXISTS event_validation_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rule_key       TEXT NOT NULL,
  rule_type      TEXT NOT NULL CHECK (rule_type IN ('forbidden_term', 'forbidden_pattern', 'required_format', 'proximity')),
  -- Shape depends on rule_type — see validate.ts's top-of-file comment:
  --   forbidden_term/forbidden_pattern: a literal word or a regex string.
  --   required_format/proximity: a JSON-encoded config object (these need
  --   more than one sub-pattern, which doesn't fit a single regex string).
  pattern        TEXT NOT NULL,
  severity       TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning')),
  message        TEXT NOT NULL,
  source_clause  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, rule_key)
);
CREATE INDEX IF NOT EXISTS idx_event_validation_rules_event ON event_validation_rules (event_id) WHERE is_active;

-- Where SAE generation's validation findings land — see
-- announcements/generate/route.ts. Non-blocking: generation always
-- succeeds, findings are surfaced for the reviewer, never enforced.
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS validation_findings JSONB;
