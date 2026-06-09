-- Security Layer: login audit + brute force protection
-- Run this in Supabase SQL Editor before deploying

CREATE TABLE IF NOT EXISTS login_attempts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text        NOT NULL,
  ip           text,
  success      boolean     NOT NULL DEFAULT false,
  reason       text,       -- ok | wrong_password | not_found | account_disabled | rate_limited | ip_blocked | super_admin_ok
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time       ON login_attempts(attempted_at DESC);

-- Auto-purge attempts older than 90 days (keeps table lean)
-- Run as a cron or manually: DELETE FROM login_attempts WHERE attempted_at < now() - interval '90 days';
-- Event Website Template System
-- Replaces the JSONB-blob approach with proper relational tables.
-- Run in Supabase SQL editor (TAOS project).

-- ── 1. Website settings (one per event) ─────────────────────────────────────
create table if not exists event_websites (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade unique not null,
  slug            text unique not null,
  status          text not null default 'draft' check (status in ('draft','live')),
  template        text not null default 'vault',          -- future: 'vault' | 'summit' etc.

  -- Hero
  hero_headline      text,
  hero_subheadline   text,
  hero_bg_url        text,         -- Storage URL or external URL
  hero_video_url     text,         -- Background video URL (mp4)
  hero_cta_label     text default 'Register Now',
  hero_cta_url       text,

  -- About section (short paragraph)
  about_title        text,
  about_body         text,

  -- Stats bar
  stat_attendees     text,         -- e.g. "2000+"
  stat_speakers      text,
  stat_exhibitors    text,
  stat_countries     text,

  -- Venue info (shown in footer / venue section)
  venue_name         text,
  venue_city         text,
  venue_address      text,
  venue_date_display text,         -- e.g. "14–15 October 2025, Dubai"

  -- Theme (Vault 2047 palette by default)
  theme_primary   text not null default '#080A0C',
  theme_accent    text not null default '#E07B2C',
  theme_teal      text not null default '#00B4B0',

  -- KonfHub integration
  konfhub_event_id        text,
  konfhub_api_key         text,     -- store encrypted in real prod; fine for now
  konfhub_speaker_ticket  text,     -- ticket ID for speaker registration
  konfhub_partner_ticket  text,     -- ticket ID for partner/exhibitor

  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 2. Speakers ──────────────────────────────────────────────────────────────
create table if not exists event_speakers (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade not null,
  name            text not null,
  role            text,
  company         text,
  bio             text,
  photo_url       text,
  linkedin_url    text,
  tier            text default 'speaker'
                  check (tier in ('keynote','speaker','panelist','moderator')),
  session_title   text,
  status          text default 'approved'
                  check (status in ('pending','approved','rejected')),
  -- KonfHub fields (needed for push registration)
  email           text,
  phone           text,
  dial_code       text default '+971',
  country         text default 'UAE',
  konfhub_booking_id text,         -- populated after successful KonfHub push
  -- display
  order_index     integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

create index if not exists idx_event_speakers_event_id on event_speakers(event_id);

-- ── 3. Agenda ────────────────────────────────────────────────────────────────
create table if not exists event_agenda (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade not null,
  day             integer default 1,
  time_slot       text,
  title           text not null,
  description     text,
  speaker_name    text,
  type            text default 'session'
                  check (type in ('keynote','panel','workshop','fireside','networking','break','other')),
  track           text,
  order_index     integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

create index if not exists idx_event_agenda_event_id on event_agenda(event_id);

-- ── 4. Sponsors ──────────────────────────────────────────────────────────────
create table if not exists event_sponsors (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade not null,
  name            text not null,
  tier            text default 'gold'
                  check (tier in ('platinum','gold','silver','bronze','media','association','government','startup')),
  logo_url        text,
  website_url     text,
  konfhub_booking_id text,
  order_index     integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

create index if not exists idx_event_sponsors_event_id on event_sponsors(event_id);

-- ── Auto-update updated_at on event_websites ─────────────────────────────────
create or replace function update_event_website_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_event_website_updated_at on event_websites;
create trigger trg_event_website_updated_at
  before update on event_websites
  for each row execute function update_event_website_updated_at();

-- ── Storage bucket for website image uploads ──────────────────────────────────
-- Run this once if bucket doesn't exist:
-- insert into storage.buckets (id, name, public) values ('event-website-assets', 'event-website-assets', true)
-- on conflict do nothing;

-- ── Migration: Media Kit & Brand Guidelines URLs ───────────────────────────────
alter table event_websites add column if not exists media_kit_url        text;
alter table event_websites add column if not exists brand_kit_url        text;

-- ── Migration: Brand Setup — logos, colours, fonts ────────────────────────────
alter table event_websites add column if not exists brand_doc_url        text;
alter table event_websites add column if not exists logo_primary_url     text;
alter table event_websites add column if not exists logo_white_url       text;
alter table event_websites add column if not exists logo_dark_url        text;
alter table event_websites add column if not exists logo_horizontal_url  text;
alter table event_websites add column if not exists brand_font_heading   text;
alter table event_websites add column if not exists brand_font_body      text;
alter table event_websites add column if not exists brand_color_1        text;
alter table event_websites add column if not exists brand_color_2        text;
alter table event_websites add column if not exists brand_color_3        text;
alter table event_websites add column if not exists brand_color_4        text;
alter table event_websites add column if not exists brand_color_5        text;

-- ── Migration: Patterns, section backgrounds, page settings ───────────────────
alter table event_websites add column if not exists pattern_1_url    text;
alter table event_websites add column if not exists pattern_2_url    text;
alter table event_websites add column if not exists pattern_3_url    text;
alter table event_websites add column if not exists pattern_4_url    text;
alter table event_websites add column if not exists pattern_5_url    text;
alter table event_websites add column if not exists bg_about_url     text;
alter table event_websites add column if not exists bg_sponsors_url  text;
alter table event_websites add column if not exists bg_agenda_url    text;
alter table event_websites add column if not exists page_settings    jsonb default '{}';

-- ── Team members table ────────────────────────────────────────────────────────
create table if not exists event_team_members (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references events(id) on delete cascade not null,
  name         text,
  email        text not null,
  role         text default 'content' check (role in ('admin','content','design')),
  invite_token text unique default gen_random_uuid()::text,
  status       text default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz default now()
);
create index if not exists idx_event_team_event_id on event_team_members(event_id);

-- ── Migration: Full page builder structure ────────────────────────────────────
alter table event_websites add column if not exists page_structure_full jsonb default '{}';

-- Custom domain support
alter table event_websites
  add column if not exists custom_domain text,
  add column if not exists cf_zone_id    text;

create index if not exists event_websites_custom_domain_idx on event_websites(custom_domain) where custom_domain is not null;

-- ── Migration: Draft / publish versioning system ──────────────────────────────
-- draft_structure    → builder always writes here (never touches page_structure_full directly)
-- published_snapshot → previous live version, kept for one-click rollback
-- last_published_at  → timestamp of last publish action
alter table event_websites
  add column if not exists draft_structure      jsonb,
  add column if not exists published_snapshot   jsonb,
  add column if not exists last_published_at    timestamptz;
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
-- ─── Market Intelligence v2 — Schema Migrations ───────────────────────────────
-- Run this in Supabase SQL Editor BEFORE deploying any code changes.
-- Safe to run multiple times (IF NOT EXISTS everywhere).

-- ── 1. Jobs table (must exist before adding FK to scans) ─────────────────────
CREATE TABLE IF NOT EXISTS market_intel_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                uuid REFERENCES events(id) ON DELETE SET NULL,
  label                   text,                          -- e.g. "Batch 1 — 5 URLs"
  status                  text NOT NULL DEFAULT 'pending', -- pending|running|paused|cancelled|complete|failed
  total_urls              int  DEFAULT 0,
  completed_urls          int  DEFAULT 0,
  failed_urls             int  DEFAULT 0,
  participants_found      int  DEFAULT 0,
  speakers_found          int  DEFAULT 0,
  credits_gemini_calls    int  DEFAULT 0,
  credits_firecrawl_pages int  DEFAULT 0,
  credits_jina_pages      int  DEFAULT 0,
  partial_failures        jsonb DEFAULT '[]',
  created_at              timestamptz DEFAULT now(),
  completed_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_market_intel_jobs_event_id ON market_intel_jobs(event_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_jobs_status   ON market_intel_jobs(status);

-- ── 2. Alter scans — add job_id + new tracking fields ────────────────────────
ALTER TABLE market_intel_scans
  ADD COLUMN IF NOT EXISTS job_id               uuid REFERENCES market_intel_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS speakers_found       int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_failures     jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS credits_gemini_calls    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_firecrawl_pages int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_jina_pages      int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_fresh_rescan      boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_market_intel_scans_job_id ON market_intel_scans(job_id);

-- ── 3. Alter companies — add description, linkedin, modified_at ───────────────
ALTER TABLE market_intel_companies
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS company_linkedin_url text,
  ADD COLUMN IF NOT EXISTS modified_at          timestamptz DEFAULT now();

-- Backfill modified_at for existing rows
UPDATE market_intel_companies SET modified_at = created_at WHERE modified_at IS NULL;

-- ── 4. Speakers table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_intel_speakers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id             uuid REFERENCES market_intel_scans(id) ON DELETE CASCADE,
  job_id              uuid REFERENCES market_intel_jobs(id) ON DELETE SET NULL,
  event_id            uuid REFERENCES events(id) ON DELETE SET NULL,

  speaker_name        text NOT NULL,
  job_title           text,
  speaker_company     text,
  speaker_company_url text,
  linkedin_url        text,

  confidence          float,
  evidence            jsonb,
  source_page_url     text,

  is_duplicate        boolean DEFAULT false,

  created_at          timestamptz DEFAULT now(),
  modified_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_scan_id   ON market_intel_speakers(scan_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_job_id    ON market_intel_speakers(job_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_event_id  ON market_intel_speakers(event_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_speakers_name      ON market_intel_speakers(speaker_name);
-- ═══════════════════════════════════════════════════════════════════════════
-- RECRUITMENT PIPELINE — Run ONCE in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Job Requisitions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_requisitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  department      TEXT,
  location        TEXT,                          -- office_id or city
  employment_type TEXT DEFAULT 'full_time',      -- full_time | part_time | contract | intern
  headcount       INT  NOT NULL DEFAULT 1,
  description     TEXT,
  requirements    TEXT,
  salary_min      NUMERIC,
  salary_max      NUMERIC,
  currency        TEXT DEFAULT 'AED',
  status          TEXT NOT NULL DEFAULT 'open',  -- open | paused | closed | filled
  hiring_manager_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  opened_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_req_status_idx   ON job_requisitions(status);
CREATE INDEX IF NOT EXISTS job_req_dept_idx     ON job_requisitions(department);

-- ── 2. Candidates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  linkedin_url    TEXT,
  resume_url      TEXT,                          -- Supabase Storage path
  resume_text     TEXT,                          -- extracted text for AI
  source          TEXT DEFAULT 'direct',         -- direct | linkedin | referral | agency | website
  referred_by_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_idx ON candidates(lower(email));
CREATE INDEX IF NOT EXISTS candidates_name_idx ON candidates(full_name);

-- ── 3. Applications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requisition_id  UUID NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL DEFAULT 'applied',
                  -- applied | ai_screening | shortlisted | interview_r1 | interview_r2
                  -- | interview_final | offer | hired | rejected | withdrawn
  ai_score        INT,                           -- 0–100 fit score
  ai_summary      TEXT,                          -- Gemini analysis
  ai_strengths    TEXT[],
  ai_gaps         TEXT[],
  ai_recommendation TEXT,                        -- shortlist | hold | reject
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE(candidate_id, requisition_id)
);

CREATE INDEX IF NOT EXISTS app_requisition_idx ON candidate_applications(requisition_id);
CREATE INDEX IF NOT EXISTS app_stage_idx       ON candidate_applications(stage);
CREATE INDEX IF NOT EXISTS app_candidate_idx   ON candidate_applications(candidate_id);

-- ── 4. Interview Rounds ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  round_number    INT  NOT NULL DEFAULT 1,
  round_type      TEXT NOT NULL DEFAULT 'screening',
                  -- screening | technical | cultural | managerial | final | hr
  interviewer_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'scheduled',
                  -- scheduled | completed | cancelled | no_show
  -- Structured feedback
  rating_communication  INT CHECK (rating_communication BETWEEN 1 AND 5),
  rating_technical      INT CHECK (rating_technical      BETWEEN 1 AND 5),
  rating_culture_fit    INT CHECK (rating_culture_fit    BETWEEN 1 AND 5),
  rating_problem_solving INT CHECK (rating_problem_solving BETWEEN 1 AND 5),
  overall_rating        INT CHECK (overall_rating        BETWEEN 1 AND 5),
  strengths       TEXT,
  concerns        TEXT,
  recommendation  TEXT,                          -- advance | reject | hold
  feedback_notes  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_app_idx  ON interview_rounds(application_id);
CREATE INDEX IF NOT EXISTS interview_date_idx ON interview_rounds(scheduled_at);

-- ── 5. Candidate Emails ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  template        TEXT NOT NULL,
                  -- shortlist_invite | rejection | interview_scheduled | offer | hired
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by_id      UUID REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS email_app_idx ON candidate_emails(application_id);
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
-- TAI Training Centre — Database Schema
-- Run this entire block in your Supabase SQL editor (Database → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS courses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  subtitle         TEXT,
  tool_name        TEXT,
  tier_level       TEXT NOT NULL CHECK (tier_level IN ('foundation', 'adoption', 'advanced')),
  dept_tags        TEXT[] DEFAULT '{}',     -- empty = relevant to all depts
  is_mandatory     BOOLEAN DEFAULT true,
  source           TEXT DEFAULT 'manual',   -- 'manual' | 'gemini'
  overview         TEXT,                    -- why this matters for staff
  read_content     TEXT,                    -- the reading section
  task_steps       JSONB DEFAULT '[]',      -- [{step, instruction, tip}]
  questions        JSONB DEFAULT '[]',      -- [{question, options[], correct_index, explanation}]
  estimated_minutes INTEGER DEFAULT 15,
  status           TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  published_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  test_score    INTEGER CHECK (test_score >= 0 AND test_score <= 100),
  passed        BOOLEAN NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  answers      JSONB DEFAULT '{}',
  score        INTEGER,
  passed       BOOLEAN,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_public_read"   ON courses            FOR SELECT USING (status = 'published');
CREATE POLICY "courses_admin_write"   ON courses            FOR ALL    USING (true);
CREATE POLICY "completions_all"       ON course_completions FOR ALL    USING (true);
CREATE POLICY "attempts_all"          ON course_attempts    FOR ALL    USING (true);
-- TAI Academy v2 Migration
-- Run in Supabase SQL Editor → Database → SQL Editor → New query

-- question_bank: full pool of 10 questions per course (5 served randomly per attempt)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS question_bank JSONB DEFAULT '[]';

-- questions_served: which 5 questions this specific attempt received (for admin audit)
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS questions_served JSONB DEFAULT '[]';

-- task_submission: staff paste/type their actual AI output as evidence
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS task_submission TEXT;

-- time_spent_seconds: total seconds from course open to submission (flags suspiciously fast completions)
ALTER TABLE course_attempts ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS event_brand_guidelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  primary_color text DEFAULT '#0F1923',
  secondary_color text DEFAULT '#00A5A3',
  accent_color text DEFAULT '#C0F43C',
  background_color text DEFAULT '#FFFFFF',
  text_color text DEFAULT '#2D3E50',
  heading_font text DEFAULT 'Inter',
  body_font text DEFAULT 'Inter',
  tone text[] DEFAULT '{}',
  key_messages text[] DEFAULT '{}',
  style_keywords text[] DEFAULT '{}',
  logo_notes text,
  ai_reasoning text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id)
);

CREATE TABLE IF NOT EXISTS event_brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  label text,
  prompt_used text,
  image_url text NOT NULL,
  aspect_ratio text,
  created_at timestamptz DEFAULT now()
);
-- ─────────────────────────────────────────────────────────────────────────────
-- FINANCE OVERHEAD ALLOCATION
-- Finance operates as a shared backend. Their monthly cost pool is set once,
-- and each event's share is calculated from actual hours Finance staff log.
--
-- Allocation formula per event:
--   (hours logged on this event / total Finance hours across all events
--    in the same monthly period) × monthly_cost_pool
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Finance cost pool — one row per month ──────────────────────────────────
-- Admin sets the total Finance operational cost each month.
-- All salaries, tools, subscriptions — everything Finance costs the company.
CREATE TABLE IF NOT EXISTS finance_cost_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,  -- stored as first day of month e.g. 2026-05-01
  monthly_cost   NUMERIC(14, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Finance work logs — hours logged per event per Finance staff member ────
CREATE TABLE IF NOT EXISTS finance_work_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_work_logs_event_idx   ON finance_work_logs(event_id);
CREATE INDEX IF NOT EXISTS finance_work_logs_date_idx    ON finance_work_logs(log_date);
CREATE INDEX IF NOT EXISTS finance_work_logs_staff_idx   ON finance_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS finance_cost_config_month_idx ON finance_cost_config(period_month);

ALTER TABLE finance_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_work_logs   ENABLE ROW LEVEL SECURITY;

-- Public read for cost config (needed by P&L calculations)
CREATE POLICY "public read finance_cost_config"
  ON finance_cost_config FOR SELECT USING (true);

CREATE POLICY "public read finance_work_logs"
  ON finance_work_logs FOR SELECT USING (true);
-- ─────────────────────────────────────────────────────────────────────────────
-- EVENT P&L SCHEMA
-- Covers: budget, deals (revenue), expenses, delegates (strategic value)
-- Currency: each event is USD or INR; deal amounts stored raw + converted
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expense categories (admin-configurable) ────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default categories
INSERT INTO expense_categories (name, sort_order) VALUES
  ('Venue & Logistics',         1),
  ('AV & Technology',           2),
  ('Catering & Hospitality',    3),
  ('Marketing & Creative',      4),
  ('Travel & Accommodation',    5),
  ('Staff & Freelancers',       6),
  ('Government & Permits',      7),
  ('Miscellaneous',             8)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Event budgets ──────────────────────────────────────────────────────────
-- One row per event. Currency is the event's base currency.
-- exchange_rate_to_usd is only meaningful when currency = 'INR'.
CREATE TABLE IF NOT EXISTS event_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  currency              TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  approved_budget       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  exchange_rate_to_usd  NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- INR/USD rate locked at budget creation
  notes                 TEXT,
  set_by                UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Event deals (revenue) ─────────────────────────────────────────────────
-- Each deal is logged in the currency it was signed in.
-- converted_amount is in the event's base currency (calculated at entry).
CREATE TABLE IF NOT EXISTS event_deals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  deal_type         TEXT NOT NULL DEFAULT 'sponsorship'
                      CHECK (deal_type IN ('sponsorship', 'exhibition', 'delegate_package', 'media_partner', 'other')),
  company_name      TEXT NOT NULL,
  contact_name      TEXT,
  description       TEXT,
  -- Raw amount in deal currency
  amount            NUMERIC(14, 2) NOT NULL,
  deal_currency     TEXT NOT NULL DEFAULT 'USD',  -- free text — AED, EUR, INR, GBP, etc.
  exchange_rate     NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- to event base currency at time of entry
  -- Converted to event base currency
  converted_amount  NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  deal_date         DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Event expenses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logged_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  category_id      UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  amount           NUMERIC(14, 2) NOT NULL,
  expense_currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate    NUMERIC(10, 4) NOT NULL DEFAULT 1,  -- to event base currency at time of entry
  converted_amount NUMERIC(14, 2) GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED,
  expense_date     DATE,
  receipt_ref      TEXT,  -- reference number or receipt ID
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Event delegates ───────────────────────────────────────────────────────
-- Invited delegates — no monetary value, tracked for strategic relevance.
CREATE TABLE IF NOT EXISTS event_delegates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  company         TEXT,
  job_title       TEXT,
  industry        TEXT,
  seniority_tier  TEXT NOT NULL DEFAULT 'other'
                    CHECK (seniority_tier IN ('c_suite', 'director', 'senior_manager', 'manager', 'other')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'attended')),
  invite_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Budget allocations per category (dynamic planner) ─────────────────────
-- Allows the event's total budget to be distributed across expense categories.
-- Planned amounts can be updated any time — actuals come from event_expenses.
CREATE TABLE IF NOT EXISTS event_budget_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  planned_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, category_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS event_budget_alloc_idx       ON event_budget_allocations(event_id);
CREATE INDEX IF NOT EXISTS event_deals_event_id_idx     ON event_deals(event_id);
CREATE INDEX IF NOT EXISTS event_deals_status_idx       ON event_deals(event_id, status);
CREATE INDEX IF NOT EXISTS event_expenses_event_id_idx  ON event_expenses(event_id);
CREATE INDEX IF NOT EXISTS event_delegates_event_id_idx ON event_delegates(event_id);
CREATE INDEX IF NOT EXISTS event_delegates_status_idx   ON event_delegates(event_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE expense_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_delegates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budget_allocations ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all writes go through API using supabaseAdmin.
-- Public read for categories (needed by staff entry forms).
CREATE POLICY "public read expense_categories"
  ON expense_categories FOR SELECT USING (true);
-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT EXECUTION FLOW, RACI & APPROVAL SYSTEM
-- Implements: event-execution-raci-flow.md
-- Run ONCE in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. RACI Master Template ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_raci_master (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase                  INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 5),
  phase_name             TEXT NOT NULL,
  name                   TEXT NOT NULL,
  timeline_type          TEXT NOT NULL
    CHECK (timeline_type IN ('fixed_duration','fixed_pre_event','cycle_dependent')),
  default_duration_days  INTEGER,      -- for fixed_duration
  default_pre_event_days INTEGER,      -- for fixed_pre_event (days before event_date)
  cycle_track            TEXT          -- for cycle_dependent
    CHECK (cycle_track IN ('speaker_acquisition','sponsorship_sales','delegate_sales',
                           'marketing','operations','partnerships','media_partners')),
  cycle_milestone_pct    INTEGER,      -- 10/30/60/80/100 for %-milestone tracks
  cycle_phase_label      TEXT,         -- human label for phase-based tracks
  responsible_roles      TEXT[] NOT NULL DEFAULT '{}',
  accountable_roles      TEXT[] NOT NULL DEFAULT '{}',
  consulted_roles        TEXT[] NOT NULL DEFAULT '{}',
  informed_roles         TEXT[] NOT NULL DEFAULT '{}',
  approval_required      BOOLEAN NOT NULL DEFAULT FALSE,
  approver_roles         TEXT[] NOT NULL DEFAULT '{}',
  depends_on_names       TEXT[] NOT NULL DEFAULT '{}',
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Per-Event COO Execution Config ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_raci_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
  total_cycle_days     INTEGER NOT NULL CHECK (total_cycle_days > 0),
  cycle_start_date     DATE NOT NULL,
  configured_by        UUID REFERENCES staff_members(id),
  configured_at        TIMESTAMPTZ DEFAULT NOW(),
  override_log         JSONB NOT NULL DEFAULT '[]'  -- array of {field, default, value, reason, by, at}
);

-- ── 3. Per-Event RACI Checkpoints (seeded from master) ───────────────────────
CREATE TABLE IF NOT EXISTS event_raci_checkpoints (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  master_id            UUID REFERENCES event_raci_master(id),
  phase                INTEGER NOT NULL,
  phase_name           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  timeline_type        TEXT NOT NULL,
  cycle_track          TEXT,
  cycle_milestone_pct  INTEGER,
  cycle_phase_label    TEXT,
  responsible_roles    TEXT[] NOT NULL DEFAULT '{}',
  accountable_roles    TEXT[] NOT NULL DEFAULT '{}',
  consulted_roles      TEXT[] NOT NULL DEFAULT '{}',
  informed_roles       TEXT[] NOT NULL DEFAULT '{}',
  approval_required    BOOLEAN NOT NULL DEFAULT FALSE,
  approver_roles       TEXT[] NOT NULL DEFAULT '{}',
  depends_on_names     TEXT[] NOT NULL DEFAULT '{}',
  due_date             DATE,
  status               TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','complete','pending_approval','approved','rejected','overdue')),
  completion_notes     TEXT,
  completed_at         TIMESTAMPTZ,
  completed_by         UUID REFERENCES staff_members(id),
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. COO Overrides — every override needs a mandatory reason ────────────────
CREATE TABLE IF NOT EXISTS event_raci_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id     UUID NOT NULL REFERENCES event_raci_checkpoints(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_overridden  TEXT NOT NULL,
  default_value     TEXT,
  overridden_value  TEXT NOT NULL,
  override_reason   TEXT NOT NULL,
  overridden_by     UUID REFERENCES staff_members(id),
  overridden_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Approval Workflow ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_raci_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id   UUID NOT NULL REFERENCES event_raci_checkpoints(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  requested_by    UUID REFERENCES staff_members(id),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES staff_members(id),
  reviewer_role   TEXT,
  review_note     TEXT
);

-- ── 6. Change History (triggers re-approval when material change detected) ────
CREATE TABLE IF NOT EXISTS event_raci_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id         UUID NOT NULL REFERENCES event_raci_checkpoints(id) ON DELETE CASCADE,
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  changed_by            UUID REFERENCES staff_members(id),
  changed_at            TIMESTAMPTZ DEFAULT NOW(),
  field_changed         TEXT NOT NULL,
  old_value             TEXT,
  new_value             TEXT,
  triggered_reapproval  BOOLEAN DEFAULT FALSE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_raci_cp_event   ON event_raci_checkpoints(event_id);
CREATE INDEX IF NOT EXISTS idx_raci_cp_phase   ON event_raci_checkpoints(event_id, phase);
CREATE INDEX IF NOT EXISTS idx_raci_cp_track   ON event_raci_checkpoints(event_id, cycle_track);
CREATE INDEX IF NOT EXISTS idx_raci_app_cp     ON event_raci_approvals(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_raci_ovr_cp     ON event_raci_overrides(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_raci_hist_cp    ON event_raci_history(checkpoint_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED MASTER RACI TEMPLATE
-- All 80+ checkpoints from the RACI document
-- ═══════════════════════════════════════════════════════════════════════════
TRUNCATE event_raci_master;

INSERT INTO event_raci_master
  (phase, phase_name, name, timeline_type, default_duration_days, default_pre_event_days,
   cycle_track, cycle_milestone_pct, cycle_phase_label,
   responsible_roles, accountable_roles, consulted_roles, informed_roles,
   approval_required, approver_roles, depends_on_names, sort_order)
VALUES

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — Concept and Strategic Foundation
-- ────────────────────────────────────────────────────────────────────────────
(1,'Concept & Strategic Foundation','Concept Note',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Operations Lead','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Board'], ARRAY[]::TEXT[], 10),

(1,'Concept & Strategic Foundation','COO Timeline / Deadline Setup',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['COO'],
 ARRAY['COO'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Operations Lead','Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Board'], ARRAY['Concept Note'], 20),

(1,'Concept & Strategic Foundation','Speaker / Sponsor Validation Call Report',
 'fixed_duration',5,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Marketing Manager','Commercial Director'],
 ARRAY['COO','Operations Lead'],
 TRUE, ARRAY['Commercial Director'], ARRAY['Concept Note'], 30),

(1,'Concept & Strategic Foundation','Project Brief',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Marketing Manager','Operations Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Commercial Director','COO'], ARRAY['Concept Note'], 40),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — Planning, Commercial, and Brand Asset Creation
-- ────────────────────────────────────────────────────────────────────────────
(2,'Planning, Commercial & Brand Assets','Marketing Brief & Plan',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],
 ARRAY['Producer'],
 ARRAY['Commercial Director','Branding Lead'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Commercial Director','COO','Marketing Director'], ARRAY['Project Brief'], 10),

(2,'Planning, Commercial & Brand Assets','Commercial Angle',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Commercial Director'],
 ARRAY['Commercial Director'],
 ARRAY['Producer','Delegate Sales Lead','Marketing Manager'],
 ARRAY['Operations Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Board','COO'], ARRAY['Project Brief'], 20),

(2,'Planning, Commercial & Brand Assets','Sponsorship Top Target List',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Commercial Director'],
 ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 TRUE, ARRAY['COO'], ARRAY['Commercial Angle'], 30),

(2,'Planning, Commercial & Brand Assets','Delegate / Buyer Top Target List',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Delegate Sales Lead'],
 ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 TRUE, ARRAY['Commercial Director'], ARRAY['Commercial Angle'], 40),

(2,'Planning, Commercial & Brand Assets','Government / Institutional Target List',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Partnerships Lead'],
 ARRAY['Operations Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 TRUE, ARRAY['Commercial Director','COO'], ARRAY['Commercial Angle'], 50),

(2,'Planning, Commercial & Brand Assets','Logo & Brand Guidelines',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Branding Lead'],
 ARRAY['Marketing Manager'],
 ARRAY['Producer'],
 ARRAY['Commercial Director','Delegate Sales Lead','Sponsorship Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Board','Marketing Director'], ARRAY['Project Brief','Marketing Brief & Plan'], 60),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Public-Facing and Sales-Ready Asset Creation
-- ────────────────────────────────────────────────────────────────────────────
(3,'Public-Facing & Sales-Ready Assets','Website Copy',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],
 ARRAY['Commercial Director'],
 ARRAY['Producer'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Marketing Head'], ARRAY['Project Brief','Marketing Brief & Plan','Commercial Angle'], 10),

(3,'Public-Facing & Sales-Ready Assets','Brochure / Sales Deck Copy',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],
 ARRAY['Commercial Director'],
 ARRAY['Producer'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Marketing Director'], ARRAY['Project Brief','Marketing Brief & Plan','Commercial Angle'], 20),

(3,'Public-Facing & Sales-Ready Assets','Website Design & Build',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['Branding Lead','Marketing Manager'],
 ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Board','COO','Commercial Director'], ARRAY['Logo & Brand Guidelines','Website Copy'], 30),

(3,'Public-Facing & Sales-Ready Assets','Brochure / Sales Deck Design',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['Branding Lead'],
 ARRAY['Commercial Director'],
 ARRAY['Marketing Manager','Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Board','COO','Commercial Director'], ARRAY['Logo & Brand Guidelines','Brochure / Sales Deck Copy'], 40),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — Event-Cycle-Dependent Execution Tracks
-- ────────────────────────────────────────────────────────────────────────────

-- Speaker Acquisition
(4,'Cycle Execution Tracks','Speaker Acquisition — 10%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',10,'10% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],10),

(4,'Cycle Execution Tracks','Speaker Acquisition — 30%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',30,'30% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 10%'],20),

(4,'Cycle Execution Tracks','Speaker Acquisition — 60%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',60,'60% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 30%'],30),

(4,'Cycle Execution Tracks','Speaker Acquisition — 80%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',80,'80% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 60%'],40),

(4,'Cycle Execution Tracks','Speaker Acquisition — 100%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',100,'100% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 80%'],50),

-- Sponsorship / Exhibitor Sales
(4,'Cycle Execution Tracks','Sponsorship Sales — 10%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',10,'10% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],60),

(4,'Cycle Execution Tracks','Sponsorship Sales — 30%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',30,'30% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 10%'],70),

(4,'Cycle Execution Tracks','Sponsorship Sales — 60%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',60,'60% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 30%'],80),

(4,'Cycle Execution Tracks','Sponsorship Sales — 80%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',80,'80% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 60%'],90),

(4,'Cycle Execution Tracks','Sponsorship Sales — 100%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',100,'100% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 80%'],100),

-- Delegate Sales
(4,'Cycle Execution Tracks','Delegate Acquisition — 10%',
 'cycle_dependent',NULL,NULL,'delegate_sales',10,'10% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],110),

(4,'Cycle Execution Tracks','Delegate Acquisition — 30%',
 'cycle_dependent',NULL,NULL,'delegate_sales',30,'30% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 10%'],120),

(4,'Cycle Execution Tracks','Delegate Acquisition — 60%',
 'cycle_dependent',NULL,NULL,'delegate_sales',60,'60% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 30%'],130),

(4,'Cycle Execution Tracks','Delegate Acquisition — 80%',
 'cycle_dependent',NULL,NULL,'delegate_sales',80,'80% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 60%'],140),

(4,'Cycle Execution Tracks','Delegate Acquisition — 100%',
 'cycle_dependent',NULL,NULL,'delegate_sales',100,'100% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 80%'],150),

-- Marketing Campaign Execution
(4,'Cycle Execution Tracks','Marketing — Launch / Awareness Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Launch / Awareness',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build'],160),

(4,'Cycle Execution Tracks','Marketing — Consideration / Engagement Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Consideration / Engagement',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Marketing — Launch / Awareness Phase'],170),

(4,'Cycle Execution Tracks','Marketing — Conversion / Last-Mile Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Conversion / Last-Mile',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Marketing — Consideration / Engagement Phase'],180),

(4,'Cycle Execution Tracks','Marketing — Final Attendee Communications Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Final Attendee Communications',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Marketing — Conversion / Last-Mile Phase'],190),

-- Operations / Logistics
(4,'Cycle Execution Tracks','Operations — Venue & Date Confirmed',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Venue Confirmed',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],200),

(4,'Cycle Execution Tracks','Operations — Initial AV / Production Scope',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Initial AV Scope',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],210),

(4,'Cycle Execution Tracks','Operations — Initial Floorplan',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Initial Floorplan',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],220),

(4,'Cycle Execution Tracks','Operations — Revised Floorplan After Sales Progress',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Revised Floorplan',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Initial Floorplan'],230),

(4,'Cycle Execution Tracks','Operations — Vendor Confirmation Progress',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Vendor Progress',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],240),

(4,'Cycle Execution Tracks','Operations — Staffing Plan Progress',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Staffing Progress',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],250),

-- Partnerships Cycle
(4,'Cycle Execution Tracks','Partnerships — Target List Ready',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'Target List',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],260),

(4,'Cycle Execution Tracks','Partnerships — First Wave Outreach Launched',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'First Wave Outreach',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — Target List Ready'],270),

(4,'Cycle Execution Tracks','Partnerships — First Wave Confirmed',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'First Wave Done',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — First Wave Outreach Launched'],280),

(4,'Cycle Execution Tracks','Partnerships — Second Wave Confirmed',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'Second Wave Done',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — First Wave Confirmed'],290),

(4,'Cycle Execution Tracks','Partnerships — Final Activation Brief Closed',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'Activation Brief Closed',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — Second Wave Confirmed'],300),

-- Media Partners Cycle
(4,'Cycle Execution Tracks','Media Partners — Target List Ready',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Target List',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],310),

(4,'Cycle Execution Tracks','Media Partners — Outreach Launched',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Outreach Launched',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — Target List Ready'],320),

(4,'Cycle Execution Tracks','Media Partners — First Wave Confirmed',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'First Wave Done',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — Outreach Launched'],330),

(4,'Cycle Execution Tracks','Media Partners — Promo Calendar Locked',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Promo Calendar',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — First Wave Confirmed'],340),

(4,'Cycle Execution Tracks','Media Partners — Final Pre-Event Coverage Locked',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Final Coverage',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — Promo Calendar Locked'],350),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — Pre-Event Lock and Readiness
-- ────────────────────────────────────────────────────────────────────────────
(5,'Pre-Event Lock & Readiness','Agenda Finalisation',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE,ARRAY['COO','Commercial Director'],ARRAY[]::TEXT[],10),

(5,'Pre-Event Lock & Readiness','Speaker Final Confirmations Complete',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Operations Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Agenda Finalisation'],20),

(5,'Pre-Event Lock & Readiness','Moderator / Speaker Briefing Notes Finalised',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Final Confirmations Complete'],30),

(5,'Pre-Event Lock & Readiness','Session Flow / Run Sheet Finalised',
 'fixed_pre_event',NULL,5,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Marketing Manager','Operations Lead'],
 ARRAY['Commercial Director'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Moderator / Speaker Briefing Notes Finalised'],40),

(5,'Pre-Event Lock & Readiness','On-Site Marketing Materials — Design Freeze',
 'fixed_pre_event',NULL,21,NULL,NULL,NULL,
 ARRAY['Branding Lead'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Operations Lead','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE,ARRAY['Marketing Director','Commercial Director','Producer'],ARRAY[]::TEXT[],50),

(5,'Pre-Event Lock & Readiness','On-Site Marketing Materials — Files to Print / Production',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Branding Lead'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Operations Lead','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE,ARRAY['Marketing Director','Commercial Director','Producer'],
 ARRAY['On-Site Marketing Materials — Design Freeze'],60),

(5,'Pre-Event Lock & Readiness','Final Website / Agenda Update Complete',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Media Lead','Partnerships Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],70),

(5,'Pre-Event Lock & Readiness','Final Attendee Communication Issued',
 'fixed_pre_event',NULL,5,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],80),

(5,'Pre-Event Lock & Readiness','Sponsor Deliverables Freeze',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],90),

(5,'Pre-Event Lock & Readiness','Asset Collection Complete',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsor Deliverables Freeze'],100),

(5,'Pre-Event Lock & Readiness','Delegate Registration Close / Handover Freeze',
 'fixed_pre_event',NULL,1,NULL,NULL,NULL,
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],110),

(5,'Pre-Event Lock & Readiness','VIP Confirmations Complete',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],120),

(5,'Pre-Event Lock & Readiness','AV / Production Scope Freeze',
 'fixed_pre_event',NULL,21,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Sponsorship Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],130),

(5,'Pre-Event Lock & Readiness','Floorplan Freeze',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['AV / Production Scope Freeze'],140),

(5,'Pre-Event Lock & Readiness','Vendor Confirmation Complete',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],150),

(5,'Pre-Event Lock & Readiness','Staffing Plan Finalised',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],160),

(5,'Pre-Event Lock & Readiness','Final Operational Readiness',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE,ARRAY['Board','COO'],ARRAY[]::TEXT[],170),

(5,'Pre-Event Lock & Readiness','Print Materials Delivered',
 'fixed_pre_event',NULL,2,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Branding Lead','Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 FALSE,ARRAY[]::TEXT[],ARRAY['On-Site Marketing Materials — Files to Print / Production'],180),

(5,'Pre-Event Lock & Readiness','Registration Desk Materials Ready',
 'fixed_pre_event',NULL,2,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead'],
 ARRAY['Producer','Commercial Director'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],190),

(5,'Pre-Event Lock & Readiness','Media Promo Calendar Locked',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],200),

(5,'Pre-Event Lock & Readiness','Partner Final Deliverables Locked',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],210);
-- Social accounts per event
CREATE TABLE IF NOT EXISTS event_social_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('Facebook', 'Instagram', 'LinkedIn')),
  page_name    text,
  page_url     text,
  page_id      text,
  access_token text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (event_id, platform)
);

-- Track publish attempts per post
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS published_at  timestamptz,
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS external_post_id text;
-- ─────────────────────────────────────────────────────────────────────────────
-- HR OVERHEAD ALLOCATION
-- HR operates as a shared function. Monthly cost pool set by admin.
-- HR staff log timesheets — tagged to an event or left general (company overhead).
--
-- Event allocation per month:
--   (hr_hours_on_event / total_hr_hours_that_month) × monthly_cost_pool
--
-- Untagged hours → company overhead (not charged to any event).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. HR monthly cost pool ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cost_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,   -- first day of month e.g. 2026-05-01
  monthly_cost   NUMERIC(14, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT,
  set_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. HR timesheets ──────────────────────────────────────────────────────────
-- event_id is nullable — null means company overhead (recruitment, general HR ops)
CREATE TABLE IF NOT EXISTS hr_work_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE SET NULL,  -- nullable
  staff_id     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  hours        NUMERIC(5, 2) NOT NULL CHECK (hours > 0),
  description  TEXT NOT NULL,
  work_type    TEXT NOT NULL DEFAULT 'event_support'
                 CHECK (work_type IN ('event_support', 'recruitment', 'onboarding', 'training', 'admin', 'other')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_work_logs_event_idx   ON hr_work_logs(event_id);
CREATE INDEX IF NOT EXISTS hr_work_logs_date_idx    ON hr_work_logs(log_date);
CREATE INDEX IF NOT EXISTS hr_work_logs_staff_idx   ON hr_work_logs(staff_id);
CREATE INDEX IF NOT EXISTS hr_cost_config_month_idx ON hr_cost_config(period_month);

ALTER TABLE hr_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_work_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read hr_cost_config" ON hr_cost_config FOR SELECT USING (true);
CREATE POLICY "public read hr_work_logs"   ON hr_work_logs   FOR SELECT USING (true);
