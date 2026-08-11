-- ============================================================
-- WORKSPACE-LEVEL EMAIL TEMPLATES (2026-08-09) — Phase 2 of the
-- SAE producer-workflow initiative. Reusable across events/teams —
-- one row per template, keyed by a stable `slug` for code lookup
-- (e.g. 'speaker_onboarding_invite'), same one-row-per-item
-- convention as corporate_brand_assets.
--
-- header_image_url is a COPY, not a live reference to
-- corporate_brand_assets('template','email_header') — pre-filled
-- from getStakeholderHeaderUrl() at creation time so a template
-- stays stable if the global corporate default is later swapped.
-- "Reset to corporate default" (app UI) re-copies it on demand.
--
-- variable_hints is display-only (an "available variables" list
-- next to the editor) — nothing validates a template's {{tokens}}
-- against what's actually supplied at render time. A rigid
-- per-category variables schema is overengineering for the single
-- template this ships with; add real validation if/when it's
-- actually needed.
--
-- No RLS — matches corporate_brand_assets; guarded entirely in
-- application code via supabaseAdmin + hand-checked session cookie.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  category           TEXT NOT NULL DEFAULT 'general',  -- free-text grouping, e.g. 'sae' — not FK'd
  subject            TEXT NOT NULL,            -- may contain {{placeholder}} tokens
  body_html          TEXT NOT NULL,            -- rich-text HTML, {{placeholder}} tokens inline
  variable_hints     JSONB NOT NULL DEFAULT '[]',  -- [{key,label}] — display-only
  header_image_url   TEXT,
  header_alt_text    TEXT DEFAULT 'Trescon',
  sender_name        TEXT NOT NULL,
  sender_email       TEXT NOT NULL,
  sender_staff_id    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_slug     ON email_templates(slug);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category, name);

-- 2026-08-09: header text overlay ("Speaker Onboarding" printed on the
-- right side of the header image, giving each template a visual
-- identity). header_image_url becomes a COMPUTED field from here on —
-- either header_base_image_url as-is (no overlay text) or a server-
-- composited (Sharp) version with header_overlay_text rendered onto it.
-- Only ever written by .../[id]/header/route.ts, never directly
-- PATCHable, so it can't drift out of sync with its inputs.
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS header_base_image_url TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS header_overlay_text TEXT;

-- Doubles as this phase's send-verification audit trail AND the table
-- Phase 3's real invite-send workflow will also write to (send_type='live').
CREATE TABLE IF NOT EXISTS email_template_sends (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  send_type      TEXT NOT NULL DEFAULT 'test' CHECK (send_type IN ('test','live')),
  to_email       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error_message  TEXT,
  sent_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_template_sends_template ON email_template_sends(template_id, sent_at DESC);
