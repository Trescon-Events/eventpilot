-- ═══════════════════════════════════════════════════════════════════════════
-- KB SELF-LEARNING GAP DETECTION
-- Adds the schema for the second-pass gap-detection Gemini call: when a
-- document contains information the current processor guide doesn't ask for,
-- the uploader classifies it via a short radio-button conversation, and
-- confirmed fields are written back into knowledge-engine/processors/*.md so
-- future uploads of that type capture them automatically.
--
-- kb_field_registry     — every field ever confirmed by an uploader, across
--                         all processor types. This is the durable source of
--                         truth (Railway rebuilds the container from git on
--                         every deploy, so a raw edit to the .md file on disk
--                         does not survive a redeploy — the registry does).
-- kb_processor_changelog — full audit trail of every processor file change.
-- kb_gap_sessions        — gaps flagged for one ingest, and their resolution
--                          status. Each element of the `gaps` JSONB array
--                          carries its own `status` (unresolved / added /
--                          skipped / pending) so a session can be partially
--                          resolved (some gaps confirmed, others deferred to
--                          Thulasi's later review) without the two states
--                          being conflated into one boolean.
--
-- No RLS — consistent with the rest of the KB/documents schema (kb_migration.sql,
-- kb_baseline_columns.sql, docuhub_schema_v4.sql), which relies on app-level
-- access checks (app/lib/kb/intel-access.ts) via the service-role client.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kb_field_registry (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_type            TEXT NOT NULL,
  field_name                TEXT NOT NULL,
  field_description         TEXT NOT NULL,
  field_category            TEXT,
  example_value             TEXT,
  is_required               BOOLEAN DEFAULT FALSE,
  added_by                  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  triggered_by_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  added_at                  TIMESTAMPTZ DEFAULT NOW(),
  is_active                 BOOLEAN DEFAULT TRUE,
  UNIQUE(processor_type, field_name)
);

CREATE TABLE IF NOT EXISTS kb_processor_changelog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_type  TEXT NOT NULL,
  change_type     TEXT NOT NULL CHECK (change_type IN ('field_added', 'field_removed', 'field_modified')),
  field_name      TEXT NOT NULL,
  previous_value  TEXT,
  new_value       TEXT,
  changed_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_gap_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES documents(id) ON DELETE CASCADE,
  processor_type  TEXT NOT NULL,
  gaps            JSONB NOT NULL,
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_field_registry_type   ON kb_field_registry(processor_type);
CREATE INDEX IF NOT EXISTS idx_kb_gap_sessions_doc       ON kb_gap_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_gap_sessions_resolved  ON kb_gap_sessions(resolved);

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('kb_field_registry', 'kb_processor_changelog', 'kb_gap_sessions')
ORDER BY table_name, ordinal_position;
