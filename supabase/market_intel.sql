-- ── Market Intelligence — scan runs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_intel_scans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid REFERENCES events(id) ON DELETE SET NULL,
  source_url       text NOT NULL,
  event_name       text,
  industry         text,
  location         text,
  organizer        text,
  site_type        text,
  rendering_model  text,
  commercial_structure text,
  terminology_used text[],
  intelligence_summary text,
  pages_scanned    int  DEFAULT 0,
  participants_found int DEFAULT 0,
  status           text NOT NULL DEFAULT 'pending', -- pending | running | complete | failed
  error_message    text,
  created_at       timestamptz DEFAULT now(),
  completed_at     timestamptz
);

-- ── Market Intelligence — extracted companies ─────────────────────────────────
CREATE TABLE IF NOT EXISTS market_intel_companies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id           uuid REFERENCES market_intel_scans(id) ON DELETE CASCADE,
  event_id          uuid REFERENCES events(id) ON DELETE SET NULL,

  -- Core identity
  company_name      text NOT NULL,
  canonical_name    text,           -- AI-normalised: "AWS" → "Amazon Web Services"
  official_domain   text,
  company_website   text,

  -- Participation
  participant_type  text,           -- sponsor | exhibitor | partner | media_partner | etc
  tier              text,           -- platinum | gold | silver | bronze | strategic | etc
  sponsorship_category text,        -- technology | finance | media | government | etc

  -- Contact intelligence
  contact_email     text,
  contact_name      text,
  contact_title     text,
  contact_linkedin  text,
  hq_location       text,
  hq_country        text,

  -- Company profile (AI-generated)
  industry_sector   text,
  company_size      text,           -- startup | sme | enterprise | global
  typical_sponsorship_patterns text,
  ai_profile        jsonb,          -- full AI-generated company intelligence

  -- Extraction metadata
  confidence        float,
  evidence          jsonb,          -- array of evidence strings
  extraction_method text,
  source_page_url   text,

  -- Deduplication
  is_duplicate      boolean DEFAULT false,
  duplicate_of      uuid REFERENCES market_intel_companies(id),

  created_at        timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_market_intel_scans_event_id    ON market_intel_scans(event_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_scans_status      ON market_intel_scans(status);
CREATE INDEX IF NOT EXISTS idx_market_intel_companies_scan_id ON market_intel_companies(scan_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_companies_name    ON market_intel_companies(canonical_name);
CREATE INDEX IF NOT EXISTS idx_market_intel_companies_domain  ON market_intel_companies(official_domain);
CREATE INDEX IF NOT EXISTS idx_market_intel_companies_type    ON market_intel_companies(participant_type);
CREATE INDEX IF NOT EXISTS idx_market_intel_companies_tier    ON market_intel_companies(tier);
