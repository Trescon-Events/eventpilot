-- ============================================================
-- TRESCON CORPORATE BRAND ASSETS (2026-08-06) — the actual
-- Canva Brand Kit-style library: one row per individually named,
-- independently manageable asset (a logo, a color, a font, ...),
-- not one JSON blob. Matches the one-row-per-item convention already
-- established by the sibling Corporate Marketing module's
-- corporate_assets/corporate_testimonials tables.
--
-- corporate_brand_guidelines (see corporate_brand_guidelines.sql) keeps
-- its existing job — the versioned raw PDF-import record. This table is
-- what admin/branding/corporate/page.tsx actually browses/edits day to
-- day; a guidelines import can seed/propose rows here via
-- source_guidelines_id, but nothing here is tied to guidelines versioning.
--
-- No per-asset version history — direct edit-in-place, matching how
-- Canva's own Brand Kit works (no version concept exposed there either).
-- created_by/updated_at cover basic accountability without the
-- complexity of a full history nobody asked for.
-- ============================================================

CREATE TABLE IF NOT EXISTS corporate_brand_assets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category              TEXT NOT NULL CHECK (category IN ('logo','color','font','pattern','voice','collateral_reference','template')),
  name                  TEXT NOT NULL,          -- "Primary Logo", "Sovereign Teal", "Anek Devanagari (Headings)"
  subcategory           TEXT,                    -- logo: 'primary'|'white'|'dark'|'venture'; color: 'primary'|'secondary';
                                                   -- template: a stable slot key, e.g. 'email_header' — see below

  file_url              TEXT,                    -- raster (PNG/JPG/WebP) — logos, pattern examples, collateral refs
  vector_url            TEXT,                    -- SVG master, when available — separate from file_url, may be null
  format                TEXT,                    -- 'png' | 'svg' | 'jpg' | 'webp' | 'data' (color/font: no file)

  metadata              JSONB DEFAULT '{}',      -- hex/rgb (color); brand_font_id+weight+usage_notes (font);
                                                   -- usage_notes, source_page (any category)
                                                   --
                                                   -- 2026-08-07: font rows also carry metadata.content_type — a
                                                   -- free-text slug (not a DB enum on purpose — see
                                                   -- app/lib/branding/brand-rules.ts's doc comment for why),
                                                   -- consumed by resolveFontForContentType() so the Creative
                                                   -- Templates editor can suggest a brand-correct font for a new
                                                   -- text layer instead of a human re-picking it from scratch
                                                   -- every time.

  display_order         INT DEFAULT 0,
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('pdf_import','manual')),
  source_guidelines_id  UUID REFERENCES corporate_brand_guidelines(id) ON DELETE SET NULL,

  created_by            UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_brand_assets_category ON corporate_brand_assets(category, display_order);

-- 2026-08-06: 'template' category added — these are actually CONSUMED by
-- app code (e.g. the email header is inlined into real outgoing
-- notification emails), unlike every other category here which is purely
-- for humans to browse/reference. Exactly one row per template slot is
-- enforced at the DB level (upload-a-new-one replaces, never
-- accumulates) — this partial unique index is what makes "the current
-- email_header template" an unambiguous lookup by subcategory alone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_brand_assets_template_slot
  ON corporate_brand_assets(subcategory) WHERE category = 'template';
