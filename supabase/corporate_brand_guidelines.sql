-- ============================================================
-- TRESCON CORPORATE BRAND — admin Branding tab, "Corporate Brand"
-- section (2026-08-06). Not event-scoped — one company-wide,
-- versioned brand identity record, distinct from event_brand_guidelines
-- (per-event, app/admin/events/[id]/brand/) and unrelated to SAE.
--
-- Versioning mirrors event_messaging_docs exactly: a full PDF re-upload
-- creates a new version row (superseding the previous live one); smaller
-- corrections (fixing a field, updating canva_url) edit the current live
-- row in place via PATCH — no new version.
--
-- Canva's public Connect API has no "Brand Kit" endpoint (verified
-- against Canva's own API reference, 2026-08-06) — get-brand-template
-- only returns template metadata (id/title/thumbnail/urls), never logo
-- files, hex colors, or font names, and there is no separate Brand Kit
-- API category at all. canva_url below is therefore just a convenience
-- link back to the live Canva design for humans to click through and
-- edit — never read programmatically. Real data comes from re-uploading
-- an exported PDF, same "Canva remains master design; EventPilot owns
-- dynamic content" model corporate_marketing.sql already established
-- for the Corporate Deck.
-- ============================================================

CREATE TABLE IF NOT EXISTS corporate_brand_guidelines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version          INTEGER NOT NULL DEFAULT 1,
  title            TEXT NOT NULL,               -- e.g. "Trescon Corporate Brand Guidelines v3"
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'live', 'superseded')),
  superseded_by    UUID REFERENCES corporate_brand_guidelines(id) ON DELETE SET NULL,

  source_url       TEXT,          -- storage URL of the uploaded PDF
  canva_url        TEXT,          -- convenience link back to the live Canva design — not read programmatically
  raw_text         TEXT,
  structured_json  JSONB,         -- full extraction, same shape as extractBrandGuidelinesFromPdfUrl() returns

  uploaded_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_brand_guidelines_status ON corporate_brand_guidelines(status);

-- 2026-08-06: the 5 fixed logo_*_url columns from this table's first cut
-- are superseded by corporate_brand_assets (see corporate_brand_assets.sql)
-- — the real Trescon Brandbook turned out to define a whole LOGO FAMILY
-- (main mark + Holdings/Events/Bespoke Events/Education & Training
-- sub-brands), not 5 fixed slots. Dropped rather than left unused, since
-- nothing in production depended on them yet.
ALTER TABLE corporate_brand_guidelines
  DROP COLUMN IF EXISTS logo_primary_url,
  DROP COLUMN IF EXISTS logo_white_url,
  DROP COLUMN IF EXISTS logo_dark_url,
  DROP COLUMN IF EXISTS logo_horizontal_url,
  DROP COLUMN IF EXISTS logo_favicon_url;
