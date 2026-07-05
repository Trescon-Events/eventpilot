-- ═══════════════════════════════════════════════════════════════════════════
-- KB BASELINE COLUMNS
-- The live `documents` table was only ever the minimal core_schema.sql version
-- (id, event_id, staff_id, title, type, file_url, status, pilot_use,
-- created_at, is_active, word_count). app/api/documents/{upload,process,list,
-- review}/route.ts and app/api/ask/route.ts all reference a richer schema
-- (extracted_text, visibility, layer, department, min_level, ai_reasoning,
-- confidence, flagged, uploaded_by, submitted_by, reviewed_by, review_note)
-- that was coded against but never actually migrated. This adds it.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS visibility     TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS uploaded_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note    TEXT,
  ADD COLUMN IF NOT EXISTS layer          TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS department     TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS min_level      TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS ai_reasoning   TEXT,
  ADD COLUMN IF NOT EXISTS confidence     INTEGER DEFAULT 70,
  ADD COLUMN IF NOT EXISTS flagged        BOOLEAN DEFAULT FALSE;

-- The `documents_type_check` constraint added by kb_migration.sql would break
-- the existing free-form "custom document type" feature (app/api/document-types
-- derives custom types from any distinct value already in `type`, no fixed list,
-- no CHECK enforced previously). Drop it — type validation stays app-level, as
-- it always has been. The new type values (event_report, proposal, tender, etc.)
-- work fine with no constraint at all.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;

CREATE INDEX IF NOT EXISTS idx_documents_layer ON documents(layer);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;
