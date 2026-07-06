-- ============================================================
-- CORPORATE MARKETING — CM-001 Corporate Deck Management
-- Phase 1 (MVP) — content management layer for the corporate deck.
-- Canva remains master design; EventPilot owns dynamic content
-- + published version history.
-- ============================================================

-- ── corporate_decks ─────────────────────────────────────────
-- One row per uploaded master deck. Replaced (not versioned) when
-- Marketing uploads a new master. Version snapshots live in
-- corporate_deck_versions.
CREATE TABLE IF NOT EXISTS corporate_decks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title               TEXT NOT NULL DEFAULT 'Corporate Deck',
  pdf_storage_path    TEXT,                       -- path in supabase storage bucket 'corporate-marketing'
  pdf_file_name       TEXT,
  pdf_bytes           BIGINT,
  page_count          INT,
  canva_url           TEXT,

  ai_analysis_status  TEXT NOT NULL DEFAULT 'pending'
                      CHECK (ai_analysis_status IN ('pending','running','ready','confirmed','failed')),
  ai_analysis_raw     JSONB DEFAULT '{}',         -- raw Gemini response
  ai_analysis_error   TEXT,

  uploaded_by         UUID REFERENCES staff_members(id),
  uploaded_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Only one "current" deck at a time — soft-enforced in app code, not DB.

-- ── corporate_deck_versions ────────────────────────────────
-- Immutable snapshots created on "Publish New Deck Version".
-- Store-and-serve model: the uploaded PDF at publish time is
-- copied and kept forever. Content edits are captured as a
-- change_summary + a snapshot of the content tables (JSONB).
CREATE TABLE IF NOT EXISTS corporate_deck_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id           UUID NOT NULL REFERENCES corporate_decks(id) ON DELETE CASCADE,

  version_number    INT NOT NULL,                 -- monotonic per deck_id
  published_by      UUID REFERENCES staff_members(id),
  published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_summary    TEXT,

  pdf_storage_path  TEXT NOT NULL,                -- immutable copy of the PDF at publish time
  pdf_file_name     TEXT,
  pdf_bytes         BIGINT,
  canva_url         TEXT,                         -- snapshot of the Canva link at publish time

  content_snapshot  JSONB DEFAULT '{}',           -- frozen copy of company_content / testimonials / leadership overrides / mappings

  UNIQUE (deck_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_corp_deck_versions_deck ON corporate_deck_versions(deck_id, version_number DESC);

-- ── corporate_deck_mappings ────────────────────────────────
-- Which editable content section appears on which slide of the
-- current master deck. Recreated when a new master is uploaded
-- + reconfirmed. section_key = 'company_overview' | 'vision' |
-- 'mission' | 'tagline' | 'boilerplate' | 'company_stats' |
-- 'event_series_stats' | 'event_stats' | 'upcoming_events' |
-- 'past_events' | 'leadership' | 'testimonials' | 'images' |
-- 'success_stories'
CREATE TABLE IF NOT EXISTS corporate_deck_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id       UUID NOT NULL REFERENCES corporate_decks(id) ON DELETE CASCADE,

  section_key   TEXT NOT NULL,
  section_label TEXT,                             -- human label from Gemini
  slide_numbers INT[] NOT NULL DEFAULT '{}',      -- e.g. {4, 18, 29}
  confirmed     BOOLEAN NOT NULL DEFAULT FALSE,   -- true after user confirms Gemini's detection
  ai_confidence NUMERIC(4,3),                     -- 0.000 - 1.000

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (deck_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_corp_deck_mappings_deck ON corporate_deck_mappings(deck_id);

-- ── corporate_company_content ──────────────────────────────
-- Key-value store for all long-form company content shown in
-- the deck: overview / vision / mission / tagline / boilerplate
-- / stats (as JSON) / success stories (as JSON). One row per
-- key. Singleton table — the module operates on the whole
-- company, not per-deck.
CREATE TABLE IF NOT EXISTS corporate_company_content (
  key           TEXT PRIMARY KEY,                 -- e.g. 'company_overview', 'vision', 'company_stats'
  label         TEXT NOT NULL,
  value_text    TEXT,                             -- for prose fields
  value_json    JSONB,                            -- for structured fields (stats, success stories)
  updated_by    UUID REFERENCES staff_members(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── corporate_testimonials ─────────────────────────────────
CREATE TABLE IF NOT EXISTS corporate_testimonials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  quote         TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  author_title  TEXT,
  author_company TEXT,
  author_photo_url TEXT,
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,

  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_deck BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT DEFAULT 0,

  created_by    UUID REFERENCES staff_members(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corp_testimonials_order ON corporate_testimonials(display_order);

-- ── corporate_assets ───────────────────────────────────────
-- Approved image library for the deck. asset_type = 'image'
-- for Phase 1; kept generic so we can later add 'video', 'logo'.
CREATE TABLE IF NOT EXISTS corporate_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  asset_type    TEXT NOT NULL DEFAULT 'image'
                CHECK (asset_type IN ('image','video','logo','other')),
  title         TEXT,
  storage_path  TEXT NOT NULL,                    -- path in supabase storage bucket 'corporate-marketing'
  public_url    TEXT,
  file_name     TEXT,
  file_bytes    BIGINT,
  mime_type     TEXT,
  tags          TEXT[] DEFAULT '{}',
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_deck BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT DEFAULT 0,

  uploaded_by   UUID REFERENCES staff_members(id),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corp_assets_order ON corporate_assets(display_order);

-- ── corporate_leadership_overrides ─────────────────────────
-- Deck-only overrides for leadership. Source of truth for the
-- person is staff_members. Marketing only controls: display
-- order, include/exclude flag, optional corporate bio override.
CREATE TABLE IF NOT EXISTS corporate_leadership_overrides (
  staff_id          UUID PRIMARY KEY REFERENCES staff_members(id) ON DELETE CASCADE,
  include_in_deck   BOOLEAN NOT NULL DEFAULT FALSE,
  display_order     INT DEFAULT 0,
  corporate_bio     TEXT,
  updated_by        UUID REFERENCES staff_members(id),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corp_leadership_include ON corporate_leadership_overrides(include_in_deck, display_order);
