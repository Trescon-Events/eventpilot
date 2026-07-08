-- ═══════════════════════════════════════════════════════════════════════════
-- DOCUHUB MIGRATION
-- New standalone document/asset management module — separate from the
-- Knowledge Base's `documents` table by design (see plan: distinct access
-- model, distinct lifecycle, fully decoupled from KB ingestion).
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. doc_types — admin-configurable document type definitions ──────────────
CREATE TABLE IF NOT EXISTS doc_types (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                         TEXT UNIQUE NOT NULL,
  label                       TEXT NOT NULL,
  slug_prefix                 TEXT UNIQUE NOT NULL CHECK (slug_prefix ~ '^[a-z0-9-]+$'),
  requires_event_attribution  BOOLEAN NOT NULL DEFAULT FALSE,
  supports_expiry             BOOLEAN NOT NULL DEFAULT FALSE,
  default_visibility          TEXT NOT NULL DEFAULT 'internal' CHECK (default_visibility IN ('public','internal')),
  allowed_formats             TEXT[] NOT NULL DEFAULT ARRAY['file','link']
                              CHECK (allowed_formats <@ ARRAY['file','link']::text[] AND array_length(allowed_formats,1) > 0),
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  created_by                  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. docuhub_documents — the documents themselves ───────────────────────────
CREATE TABLE IF NOT EXISTS docuhub_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type_id        UUID NOT NULL REFERENCES doc_types(id) ON DELETE RESTRICT,
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),   -- immutable after creation (enforced app-level)
  format             TEXT NOT NULL CHECK (format IN ('file','link')),
  object_key         TEXT,           -- R2 key, set iff format='file'
  external_url       TEXT,           -- set iff format='link'
  original_filename  TEXT,
  file_size_bytes    BIGINT,
  mime_type          TEXT,
  visibility         TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public','internal')),
  event_id           UUID REFERENCES events(id) ON DELETE SET NULL,
  event_label        TEXT,
  event_date         DATE,
  event_venue        TEXT,
  link_expires_at    TIMESTAMPTZ,    -- NULL = never expires; only meaningful if doc_types.supports_expiry
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at         TIMESTAMPTZ,
  deleted_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  uploaded_by        UUID NOT NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT docuhub_format_fields CHECK (
    (format = 'file' AND object_key IS NOT NULL AND external_url IS NULL) OR
    (format = 'link' AND external_url IS NOT NULL AND object_key IS NULL)
  ),
  UNIQUE (doc_type_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_docuhub_documents_type     ON docuhub_documents(doc_type_id);
CREATE INDEX IF NOT EXISTS idx_docuhub_documents_event    ON docuhub_documents(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docuhub_documents_active   ON docuhub_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_docuhub_documents_expiry   ON docuhub_documents(link_expires_at) WHERE link_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docuhub_documents_uploader ON docuhub_documents(uploaded_by);
-- pg_trgm is NOT enabled on this project (verified) — relying on plain ILIKE for search, no trigram index.

-- ── 3. module_access — generic per-module access tiers (reusable beyond DocuHub) ──
CREATE TABLE IF NOT EXISTS module_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,               -- 'dochub' for this build
  tier        TEXT NOT NULL CHECK (tier IN ('user','admin')),
  granted_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_module_access_module ON module_access(module_key);

-- ── 4. docuhub_audit_log — lightweight audit trail ────────────────────────────
CREATE TABLE IF NOT EXISTS docuhub_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID REFERENCES docuhub_documents(id) ON DELETE SET NULL,
  action       TEXT NOT NULL CHECK (action IN ('created','updated','deleted','restored')),
  actor_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  actor_tier   TEXT CHECK (actor_tier IN ('owner','user','admin','super_admin')),
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docuhub_audit_document ON docuhub_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_docuhub_audit_actor    ON docuhub_audit_log(actor_id);

-- ── 5. Seed default doc_types ──────────────────────────────────────────────────
INSERT INTO doc_types (key, label, slug_prefix, requires_event_attribution, supports_expiry, default_visibility, allowed_formats, sort_order) VALUES
  ('post_event_report', 'Post-Event Report', 'eventreports', TRUE,  FALSE, 'public',   ARRAY['file','link'], 1),
  ('bd_proposal',       'BD Proposal',       'proposals',    FALSE, TRUE,  'public',   ARRAY['file','link'], 2),
  ('hr_policy',         'HR Policy',         'policies',     FALSE, FALSE, 'internal', ARRAY['file'],        3)
ON CONFLICT (key) DO NOTHING;

-- ── 6. Verify ──────────────────────────────────────────────────────────────────
SELECT key, label, slug_prefix, requires_event_attribution, supports_expiry, default_visibility, allowed_formats FROM doc_types ORDER BY sort_order;
