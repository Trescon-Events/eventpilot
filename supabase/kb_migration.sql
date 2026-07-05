-- ═══════════════════════════════════════════════════════════════════════════
-- KNOWLEDGE BASE MIGRATION
-- Adds versioning, source URL, and BD workspace support to the documents table.
-- Run in Supabase SQL Editor BEFORE running the seed script.
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Relax the type CHECK constraint to allow new content types ─────────────
-- The original CHECK only allows: policy, event_brief, staff_doc, onboarding, other
-- We need: event_report, proposal, tender, corporate_profile, external_intel, etc.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;

ALTER TABLE documents ADD CONSTRAINT documents_type_check
  CHECK (type IN (
    'policy',
    'event_brief',
    'event_report',
    'staff_doc',
    'onboarding',
    'proposal',
    'tender',
    'corporate_profile',
    'external_intel',
    'service_portfolio',
    'other'
  ));

-- ── 2. Version control columns ────────────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_group_id UUID,
  ADD COLUMN IF NOT EXISTS version           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_note      TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by     UUID REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_group_id  ON documents(document_group_id) WHERE document_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_superseded ON documents(superseded_by)    WHERE superseded_by     IS NOT NULL;

-- ── 3. Source URL column ──────────────────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- ── 4. BD Workspace tables ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_workspaces (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE,
  client_name    TEXT,
  client_country TEXT,
  event_name     TEXT,
  event_type     TEXT CHECK (event_type IN ('managed', 'bespoke', 'tender', 'other')),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'won', 'lost', 'pending', 'withdrawn')),
  created_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bd_workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES bd_workspaces(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  role         TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_bd_workspace_members_staff ON bd_workspace_members(staff_id);
CREATE INDEX IF NOT EXISTS idx_bd_workspace_members_ws    ON bd_workspace_members(workspace_id);

-- ── 5. Link documents to BD workspaces ───────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES bd_workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id) WHERE workspace_id IS NOT NULL;

-- ── 6. Backfill document_group_id for existing live documents ─────────────────
UPDATE documents
SET document_group_id = id
WHERE document_group_id IS NULL;

-- ── 7. Helper view: current live versions only ────────────────────────────────
CREATE OR REPLACE VIEW documents_live AS
SELECT * FROM documents
WHERE superseded_by IS NULL
  AND status        = 'live'
  AND is_active     = TRUE;

-- ── 8. Verify all new columns exist ──────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN (
    'document_group_id', 'version', 'version_note',
    'superseded_by', 'source_url', 'workspace_id'
  )
ORDER BY column_name;
