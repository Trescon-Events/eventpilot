-- ═══════════════════════════════════════════════════════════════
-- BRAND GUIDELINES V2 — run once in Supabase SQL editor
-- Expands event_brand_guidelines to cover all 9 sections of a
-- full brand book (Identity, Logo, Colors, Typography, Patterns,
-- Imagery, Icons, Grid/Layout, Voice)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE event_brand_guidelines
  -- ── Brand Identity ─────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS brand_name              text,
  ADD COLUMN IF NOT EXISTS positioning_statement   text,
  ADD COLUMN IF NOT EXISTS brand_category          text,
  ADD COLUMN IF NOT EXISTS brand_vision            text,
  ADD COLUMN IF NOT EXISTS brand_mission           text,
  ADD COLUMN IF NOT EXISTS brand_archetypes        jsonb DEFAULT '[]',
  -- [{role: "primary"|"secondary"|"tertiary", name: "The Steward", description: "..."}]

  -- ── Logo ───────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS logo_primary_url        text,
  ADD COLUMN IF NOT EXISTS logo_white_url          text,
  ADD COLUMN IF NOT EXISTS logo_dark_url           text,
  ADD COLUMN IF NOT EXISTS logo_horizontal_url     text,
  ADD COLUMN IF NOT EXISTS logo_favicon_url        text,
  ADD COLUMN IF NOT EXISTS logo_min_size_digital   text,   -- e.g. "64px"
  ADD COLUMN IF NOT EXISTS logo_min_size_print     text,   -- e.g. "16mm"
  ADD COLUMN IF NOT EXISTS logo_clear_space        text,
  ADD COLUMN IF NOT EXISTS logo_donts              jsonb DEFAULT '[]',
  -- ["Don't rotate the logo", "Don't change proportions", ...]
  ADD COLUMN IF NOT EXISTS logo_cobranding_rules   text,
  ADD COLUMN IF NOT EXISTS logo_concept            text,   -- design story / foundation elements

  -- ── Colors ─────────────────────────────────────────────────
  -- Keep existing primary_color / secondary_color / accent_color for backwards compat
  ADD COLUMN IF NOT EXISTS color_palette           jsonb DEFAULT '[]',
  -- [{name, hex, role: "primary"|"secondary"|"accent"|"neutral-light"|"neutral-dark",
  --   cmyk: {c,m,y,k}, usage_notes, print_caution}]
  ADD COLUMN IF NOT EXISTS color_usage_rules       text,
  ADD COLUMN IF NOT EXISTS color_contrast_min      text DEFAULT '4.5:1',

  -- ── Typography ─────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS type_scale              jsonb DEFAULT '[]',
  -- [{level: "Display", size_px: 57, weight: 700, line_height: "110%", usage: "Hero headlines"}]
  ADD COLUMN IF NOT EXISTS type_rules_dos          jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS type_rules_donts        jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS type_scale_ratio        text DEFAULT '1.200',

  -- ── Patterns & Textures ─────────────────────────────────────
  ADD COLUMN IF NOT EXISTS pattern_assets          jsonb DEFAULT '[]',
  -- [{name, url, usage_context, background_tone: "light"|"dark"|"both"}]

  -- ── Imagery & Overlays ──────────────────────────────────────
  ADD COLUMN IF NOT EXISTS imagery_philosophy      jsonb DEFAULT '[]',
  -- ["Human intelligence augmented by AI", "Institutional credibility", ...]
  ADD COLUMN IF NOT EXISTS photography_direction   jsonb DEFAULT '{}',
  -- {subjects: [...], dos: [...], donts: [...]}
  ADD COLUMN IF NOT EXISTS overlay_types           jsonb DEFAULT '[]',
  -- ["Solid Color Overlay", "Gradient Overlay", "Opacity/Tint Overlay", ...]
  ADD COLUMN IF NOT EXISTS imagery_treatments      jsonb DEFAULT '[]',
  -- [{name, description, use_cases: [...]}]

  -- ── Icons ──────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS icon_system             text,   -- e.g. "Material Design / MUI Icons"
  ADD COLUMN IF NOT EXISTS icon_grid_size          text,   -- e.g. "24x24"
  ADD COLUMN IF NOT EXISTS icon_rules              text,

  -- ── Grid & Layout ──────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS grid_base_px            integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS grid_columns            integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS breakpoints             jsonb DEFAULT '[]',
  -- [{name: "Small", min_px: 0, max_px: 599}, ...]
  ADD COLUMN IF NOT EXISTS spacing_tokens          jsonb DEFAULT '[]',
  -- [{name: "XS", value_px: 4}, {name: "SM", value_px: 8}, ...]

  -- ── Source tracking ────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS source_pdf_url          text,
  ADD COLUMN IF NOT EXISTS build_mode              text DEFAULT 'manual',
  -- "pdf_extracted" | "manual" | "ai_generated"
  ADD COLUMN IF NOT EXISTS extracted_at            timestamptz;
