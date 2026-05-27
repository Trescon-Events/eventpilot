-- ============================================================
-- TAOS SmartData Module — Data Intelligence Layer
-- Run in Supabase SQL Editor (taos-discovery Supabase)
-- ============================================================

-- Companies (create first — contacts reference it)
CREATE TABLE IF NOT EXISTS sd_company_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            text,
  name              text        NOT NULL,
  website           text,
  property_values   jsonb       NOT NULL DEFAULT '{}',
  created_by        uuid,
  last_enriched_at  timestamptz,
  hubspot_id        text,
  last_synced_at    timestamptz,
  source_tool       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sd_company_domain_idx   ON sd_company_records(domain) WHERE domain IS NOT NULL;
CREATE INDEX        IF NOT EXISTS sd_company_name_idx     ON sd_company_records(lower(name));
CREATE INDEX        IF NOT EXISTS sd_company_pv_gin       ON sd_company_records USING gin(property_values);

-- Contacts
CREATE TABLE IF NOT EXISTS sd_contact_records (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_url        text,
  property_values     jsonb       NOT NULL DEFAULT '{}',
  company_record_id   uuid        REFERENCES sd_company_records(id) ON DELETE SET NULL,
  created_by          uuid,
  last_enriched_at    timestamptz,
  hubspot_id          text,
  last_synced_at      timestamptz,
  source_tool         text,
  extraction_id       uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sd_contact_linkedin_idx  ON sd_contact_records(linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX        IF NOT EXISTS sd_contact_company_idx   ON sd_contact_records(company_record_id);
CREATE INDEX        IF NOT EXISTS sd_contact_created_idx   ON sd_contact_records(created_at DESC);
CREATE INDEX        IF NOT EXISTS sd_contact_pv_gin        ON sd_contact_records USING gin(property_values);
CREATE INDEX        IF NOT EXISTS sd_contact_enriched_idx  ON sd_contact_records(last_enriched_at DESC);

-- Extraction jobs (log of every tool run)
CREATE TABLE IF NOT EXISTS sd_extractions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name         text        NOT NULL,
  source_type         text        NOT NULL,
  status              text        NOT NULL DEFAULT 'pending',
  user_id             uuid,
  user_email          text,
  credits_used        numeric     NOT NULL DEFAULT 0,
  companies_count     int         NOT NULL DEFAULT 0,
  contacts_count      int         NOT NULL DEFAULT 0,
  duplicates_removed  int         NOT NULL DEFAULT 0,
  touched_record_ids  jsonb       NOT NULL DEFAULT '{"contacts":[],"companies":[]}',
  fully_enriched      boolean     NOT NULL DEFAULT false,
  error_message       text,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sd_extraction_user_idx    ON sd_extractions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sd_extraction_status_idx  ON sd_extractions(status);
CREATE INDEX IF NOT EXISTS sd_extraction_type_idx    ON sd_extractions(source_type, created_at DESC);

-- ICP / Lead Finder searches (AI-driven prospecting)
CREATE TABLE IF NOT EXISTS sd_icp_searches (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid,
  name                    text        NOT NULL,
  status                  text        NOT NULL DEFAULT 'drafting',
  conversation_transcript jsonb       NOT NULL DEFAULT '[]',
  final_icp_json          jsonb,
  results_count           int,
  parent_search_id        uuid        REFERENCES sd_icp_searches(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sd_icp_user_idx     ON sd_icp_searches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sd_icp_status_idx   ON sd_icp_searches(status);

-- Saved Audiences (reusable named ICP searches)
CREATE TABLE IF NOT EXISTS sd_saved_audiences (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  final_icp_json  jsonb       NOT NULL DEFAULT '{}',
  last_run_at     timestamptz,
  results_count   int         NOT NULL DEFAULT 0,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Contact Pipeline (stage tracking per contact per event)
CREATE TABLE IF NOT EXISTS sd_contact_pipeline (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid        NOT NULL REFERENCES sd_contact_records(id) ON DELETE CASCADE,
  event_id          uuid,
  event_name        text,
  stage             text        NOT NULL DEFAULT 'prospect',
  assigned_to       uuid,
  next_action_date  date,
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sd_pipeline_contact_event_idx ON sd_contact_pipeline(contact_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS sd_pipeline_stage_idx         ON sd_contact_pipeline(stage);
CREATE INDEX        IF NOT EXISTS sd_pipeline_assigned_idx      ON sd_contact_pipeline(assigned_to);
CREATE INDEX        IF NOT EXISTS sd_pipeline_event_idx         ON sd_contact_pipeline(event_id);

-- Contact Scores (scored against an event)
CREATE TABLE IF NOT EXISTS sd_contact_scores (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid        NOT NULL REFERENCES sd_contact_records(id) ON DELETE CASCADE,
  event_id        uuid,
  score           int         NOT NULL DEFAULT 0,
  score_breakdown jsonb       NOT NULL DEFAULT '{}',
  scored_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, event_id)
);

-- Enrichment Audit Log (field-level change tracking)
CREATE TABLE IF NOT EXISTS sd_enrichment_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid        REFERENCES sd_contact_records(id) ON DELETE CASCADE,
  company_id  uuid        REFERENCES sd_company_records(id) ON DELETE CASCADE,
  source_tool text        NOT NULL,
  field_key   text        NOT NULL,
  old_value   text,
  new_value   text,
  action      text        NOT NULL DEFAULT 'auto_merge',
  performed_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sd_audit_contact_idx ON sd_enrichment_audit(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sd_audit_company_idx ON sd_enrichment_audit(company_id, created_at DESC);

-- Tool Status (enable/disable per tool)
CREATE TABLE IF NOT EXISTS sd_tool_status (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_key            text        NOT NULL UNIQUE,
  display_name        text        NOT NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  maintenance_message text,
  requires_api_key    text,
  credits_per_use     numeric     NOT NULL DEFAULT 1,
  disabled_by         uuid,
  disabled_at         timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sd_tool_status (tool_key, display_name, credits_per_use, requires_api_key) VALUES
  ('linkedin_enricher', 'LinkedIn Enricher',    1,   'LUSHA_API_KEY'),
  ('smart_lookup',      'Smart Lookup (Lusha)', 1,   'LUSHA_API_KEY'),
  ('website_finder',    'Website Finder',       0.5, 'FIRECRAWL_API_KEY'),
  ('email_verifier',    'Email Verifier',       1,   'MILLION_VERIFIER_API_KEY'),
  ('lead_finder',       'AI Lead Finder',       0,   'APOLLO_API_KEY'),
  ('email_guesser',     'Email Guesser',        1,   'APOLLO_API_KEY')
ON CONFLICT (tool_key) DO NOTHING;

-- Daily Credit Limits per job_level
CREATE TABLE IF NOT EXISTS sd_lookup_limits (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  job_level   text    NOT NULL UNIQUE,
  daily_limit int     NOT NULL DEFAULT 20,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sd_lookup_limits (job_level, daily_limit) VALUES
  ('default',      20),
  ('dept_head',   100),
  ('office_head', 999),
  ('super_admin', 999)
ON CONFLICT (job_level) DO NOTHING;

-- Daily Usage Tracker per staff member
CREATE TABLE IF NOT EXISTS sd_lookup_usage (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid    NOT NULL,
  lookup_date date    NOT NULL DEFAULT CURRENT_DATE,
  used_count  int     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lookup_date)
);

CREATE INDEX IF NOT EXISTS sd_usage_user_date_idx ON sd_lookup_usage(user_id, lookup_date);

-- Dynamic Properties Config
CREATE TABLE IF NOT EXISTS sd_properties (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_key      text        NOT NULL UNIQUE,
  label             text        NOT NULL,
  description       text,
  field_type        text        NOT NULL DEFAULT 'single_line_text',
  group_key         text        NOT NULL DEFAULT 'general',
  entity_type       text        NOT NULL DEFAULT 'contact',
  predefined_values jsonb       NOT NULL DEFAULT '[]',
  used_by_tools     jsonb       NOT NULL DEFAULT '[]',
  is_system         boolean     NOT NULL DEFAULT false,
  is_required       boolean     NOT NULL DEFAULT false,
  sort_order        int         NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Contact properties
INSERT INTO sd_properties (property_key, label, field_type, group_key, entity_type, is_system, sort_order, used_by_tools) VALUES
  ('firstName',             'First Name',          'single_line_text',    'contact_info',  'contact', true,  1,  '["linkedin_enricher","lead_finder"]'),
  ('lastName',              'Last Name',           'single_line_text',    'contact_info',  'contact', true,  2,  '["linkedin_enricher","lead_finder"]'),
  ('email',                 'Email',               'email',               'contact_info',  'contact', true,  3,  '["linkedin_enricher","email_verifier"]'),
  ('phoneNumber1',          'Phone 1',             'phone',               'contact_info',  'contact', true,  4,  '["linkedin_enricher"]'),
  ('phoneNumber2',          'Phone 2',             'phone',               'contact_info',  'contact', false, 5,  '["linkedin_enricher"]'),
  ('personLinkedinUrl',     'LinkedIn URL',        'url',                 'contact_info',  'contact', true,  6,  '["linkedin_enricher"]'),
  ('contactCity',           'City',                'single_line_text',    'contact_info',  'contact', false, 7,  '["linkedin_enricher"]'),
  ('contactState',          'State / Region',      'single_line_text',    'contact_info',  'contact', false, 8,  '["linkedin_enricher"]'),
  ('contactCountry',        'Country',             'single_line_text',    'contact_info',  'contact', false, 9,  '["linkedin_enricher"]'),
  ('title',                 'Job Title',           'single_line_text',    'professional',  'contact', true,  1,  '["linkedin_enricher","lead_finder"]'),
  ('seniority',             'Seniority',           'dropdown_select',     'professional',  'contact', false, 2,  '["linkedin_enricher"]'),
  ('departments',           'Departments',         'multiple_checkboxes', 'professional',  'contact', false, 3,  '["linkedin_enricher"]'),
  ('contactL2',             'Industry L2',         'single_line_text',    'professional',  'contact', false, 4,  '[]'),
  ('vendorTarget',          'Vendor Target',       'multiple_checkboxes', 'event_tagging', 'contact', false, 10, '["linkedin_enricher","lead_finder","website_finder"]'),
  ('delegateTarget',        'Delegate Target',     'multiple_checkboxes', 'event_tagging', 'contact', false, 11, '["linkedin_enricher","lead_finder","website_finder"]'),
  ('speakerTarget',         'Speaker Target',      'multiple_checkboxes', 'event_tagging', 'contact', false, 12, '["linkedin_enricher","lead_finder"]'),
  ('partnershipTarget',     'Partnership Target',  'multiple_checkboxes', 'event_tagging', 'contact', false, 13, '["linkedin_enricher"]'),
  ('bespokeDelegateTarget', 'Bespoke Delegate',    'multiple_checkboxes', 'event_tagging', 'contact', false, 14, '["linkedin_enricher"]'),
  ('mediaTarget',           'Media Target',        'multiple_checkboxes', 'event_tagging', 'contact', false, 15, '["linkedin_enricher"]'),
  ('investorTarget',        'Investor Target',     'multiple_checkboxes', 'event_tagging', 'contact', false, 16, '["linkedin_enricher"]')
ON CONFLICT (property_key) DO NOTHING;

-- Company properties
INSERT INTO sd_properties (property_key, label, field_type, group_key, entity_type, is_system, sort_order, used_by_tools) VALUES
  ('companyName',        'Company Name',       'single_line_text',    'company',         'company', true,  1,  '["linkedin_enricher","website_finder"]'),
  ('website',            'Website',            'url',                 'company',         'company', true,  2,  '["linkedin_enricher","website_finder"]'),
  ('companyLinkedinUrl', 'Company LinkedIn',   'url',                 'company',         'company', false, 3,  '["linkedin_enricher"]'),
  ('companyCountry',     'Country',            'single_line_text',    'company',         'company', false, 4,  '["linkedin_enricher","website_finder"]'),
  ('companyCity',        'City',               'single_line_text',    'company',         'company', false, 5,  '["linkedin_enricher"]'),
  ('industry',           'Industry',           'single_line_text',    'company',         'company', false, 6,  '["linkedin_enricher"]'),
  ('employees',          'Employees',          'number',              'company',         'company', false, 7,  '["linkedin_enricher"]'),
  ('annualRevenue',      'Annual Revenue',     'number',              'company',         'company', false, 8,  '["linkedin_enricher"]'),
  ('technologies',       'Technologies',       'multiple_checkboxes', 'company',         'company', false, 9,  '["linkedin_enricher"]'),
  ('keywords',           'Keywords',           'multiple_checkboxes', 'company',         'company', false, 10, '["linkedin_enricher"]'),
  ('hqCountry',          'HQ Country',         'single_line_text',    'company',         'company', false, 11, '["linkedin_enricher"]'),
  ('l2Categories',       'L2 Categories',      'multiple_checkboxes', 'classification',  'company', false, 1,  '["lead_finder"]'),
  ('subIndustryL2',      'Sub-Industry L2',    'single_line_text',    'classification',  'company', false, 2,  '[]'),
  ('foundedYear',        'Founded Year',       'number',              'company',         'company', false, 12, '["linkedin_enricher"]'),
  ('description',        'Description',        'multi_line_text',     'company',         'company', false, 13, '["linkedin_enricher"]')
ON CONFLICT (property_key) DO NOTHING;

-- Indexes on updated_at for cache invalidation
CREATE INDEX IF NOT EXISTS sd_contact_updated_idx  ON sd_contact_records(updated_at DESC);
CREATE INDEX IF NOT EXISTS sd_company_updated_idx  ON sd_company_records(updated_at DESC);

-- RPC: increment daily lookup usage (upsert pattern, safe for concurrent calls)
CREATE OR REPLACE FUNCTION increment_lookup_usage(p_user_id uuid, p_date date)
RETURNS void AS $$
  INSERT INTO sd_lookup_usage(user_id, lookup_date, used_count, updated_at)
  VALUES (p_user_id, p_date, 1, now())
  ON CONFLICT (user_id, lookup_date)
  DO UPDATE SET used_count = sd_lookup_usage.used_count + 1, updated_at = now();
$$ LANGUAGE sql;
