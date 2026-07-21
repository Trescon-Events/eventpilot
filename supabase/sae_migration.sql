-- Stakeholder Announcement Engine (SAE) — migration
-- All operations additive and safe to run multiple times (IF NOT EXISTS).
-- Deliberately does NOT touch: event_speakers.status/tier CHECK constraints,
-- event_sponsors.tier CHECK constraint, event_social_accounts (any column or
-- constraint), app/api/events/speakers or /sponsors routes' existing behavior.
-- See docs/EventPilot-SAE-PRD-v1.0.md (now v1.2) and the implementation plan for why.
--
-- PRD v1.1/v1.2 correction (2026-07-21): originally shipped with
-- ayrshare_profile_key / venue_map_link / venue_map_place_id (Ayrshare +
-- Google Places, both since scrapped — see PRD changelog). Already-migrated
-- environments need the follow-up rename/drop run once by hand (not IF NOT
-- EXISTS-safe, since these are renames, not additions):
--   ALTER TABLE events RENAME COLUMN ayrshare_profile_key TO postiz_profile_key;
--   ALTER TABLE events RENAME COLUMN venue_map_link TO venue_map_url;
--   ALTER TABLE events DROP COLUMN IF EXISTS venue_map_place_id;
-- (Applied directly to the live Supabase project the same day.)
--
-- Separately: the PRD's own announcement_status enum (SS4.5/4.6) never
-- included 'archived', despite SS6.4 specifying DELETE should set it there.
-- Added 'archived' to both CHECK constraints to make the API spec actually
-- satisfiable — not IF NOT EXISTS-safe (constraint replacement), so
-- already-migrated environments need:
--   ALTER TABLE event_speakers DROP CONSTRAINT event_speakers_announcement_status_check;
--   ALTER TABLE event_speakers ADD CONSTRAINT event_speakers_announcement_status_check
--     CHECK (announcement_status IN ('pending_review','approved','assets_missing','ready','archived'));
--   (same for event_sponsors)
--
-- PRD v1.4 correction (2026-07-21): Canva Autofill API dropped entirely —
-- hands-on investigation confirmed Canva's "Connect data" field-marking
-- option doesn't appear on Brand Template elements in the standard Canva
-- for Teams editor (verified both in the editor and via a real
-- GET /v1/brand-templates/{id}/dataset call returning {} for both WAIS
-- Malaysia templates). Replaced with Sharp server-side compositing —
-- Canva stays the design tool for background PNGs, EventPilot composites
-- photo/logo + text onto them at generation time. Already-migrated
-- environments need:
--   ALTER TABLE events RENAME COLUMN canva_template_config TO creative_template_config;
--   ALTER TABLE stakeholder_announcements DROP COLUMN IF EXISTS creative_canva_id;
-- (Applied directly to the live Supabase project the same day.)
--
-- PRD v1.4 Phase C v3 (2026-07-21, same day): the single-background-plus-
-- fixed-zones shape above didn't survive contact with real creatives, which
-- have genuine z-order between independently-positioned elements (e.g. a
-- speaker photo sitting *under* a translucent foreground layer to get a
-- feathered blend). events.creative_template_config is still just JSONB —
-- no column change — but its shape moved to named variants, each an
-- ordered layer stack (image / photo_slot / text): see
-- app/lib/announcements/composite.ts's Variant/Layer types for the current
-- shape. One real column addition, applied live the same day:
--   ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS creative_variant_id TEXT;
--
-- This file below reflects the corrected, current schema — a fresh run on a new
-- database produces the right columns directly.

-- ── 1. Extend events table ──────────────────────────────────────────────────
-- Note: end_date and country already exist on events (core_schema.sql /
-- commercial_tracker.sql) — deliberately excluded here.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_format     TEXT CHECK (event_format IN ('physical', 'virtual', 'hybrid')),
  ADD COLUMN IF NOT EXISTS website_url      TEXT,
  ADD COLUMN IF NOT EXISTS event_hashtag    TEXT,   -- e.g. #WAISMalaysia
  ADD COLUMN IF NOT EXISTS registration_url TEXT,   -- Get Involved / registration link
  ADD COLUMN IF NOT EXISTS social_linkedin  TEXT,   -- full page URL, for display/reference
  ADD COLUMN IF NOT EXISTS social_x         TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram TEXT,
  ADD COLUMN IF NOT EXISTS social_facebook  TEXT,
  ADD COLUMN IF NOT EXISTS social_youtube   TEXT,
  ADD COLUMN IF NOT EXISTS venue_map_url    TEXT,   -- Google Maps URL, pasted by the user — no API
  ADD COLUMN IF NOT EXISTS postiz_profile_key TEXT, -- Postiz Cloud workspace key for this event's social channels
  ADD COLUMN IF NOT EXISTS creative_template_config JSONB; -- named variants per stakeholder type, each an ordered layer stack, for Sharp compositing — see app/lib/announcements/composite.ts

-- ── 2. Topline Messaging Documents (version-controlled, per event) ─────────
CREATE TABLE IF NOT EXISTS event_messaging_docs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL DEFAULT 1,
  title            TEXT NOT NULL,               -- e.g. "WAIS Malaysia 2026 — Topline Messaging v2"
  raw_text         TEXT,                        -- full extracted text from PDF
  structured_json  JSONB,                       -- AI-extracted structured version
  source_url       TEXT,                        -- R2 URL of the original PDF
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'live', 'superseded')),
  superseded_by    UUID REFERENCES event_messaging_docs(id) ON DELETE SET NULL,
  uploaded_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_docs_event ON event_messaging_docs(event_id, status);

-- ── 3. Extend event_speakers (existing table — Website Builder / KonfHub) ──
-- Existing columns reused as-is: name, role, company, country, bio,
-- linkedin_url, photo_url. `status` (pending/approved/rejected) and its
-- CHECK constraint are NOT touched — that column drives the existing
-- KonfHub-push-on-approve logic in app/api/events/speakers/route.ts.
-- announcement_status is a separate, SAE-only column with its own lifecycle.
ALTER TABLE event_speakers
  ADD COLUMN IF NOT EXISTS photo_processed_url TEXT,       -- background-removed version (via PhotoRoom API)
  ADD COLUMN IF NOT EXISTS company_logo_url    TEXT,
  ADD COLUMN IF NOT EXISTS website_card_url    TEXT,        -- generated speaker card (future use)
  ADD COLUMN IF NOT EXISTS announcement_status TEXT NOT NULL DEFAULT 'pending_review'
                             CHECK (announcement_status IN (
                               'pending_review', 'approved', 'assets_missing', 'ready', 'archived'
                             )),
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'manual'
                             CHECK (source IN ('onboarding_form', 'manual')),
  ADD COLUMN IF NOT EXISTS form_submission_id  UUID,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS created_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_speakers_announcement_status ON event_speakers(event_id, announcement_status);

-- ── 4. Extend event_sponsors (existing table — Website Builder / KonfHub) ──
-- Existing columns reused as-is: name (-> company_name), tier (display tier,
-- untouched), logo_url, website_url (-> company_website). `tier`'s existing
-- CHECK constraint is NOT touched. partner_type is a new, broader, SAE-only
-- category column (covers exhibitor/media_partner/etc, which `tier` never did).
ALTER TABLE event_sponsors
  ADD COLUMN IF NOT EXISTS company_description TEXT,
  ADD COLUMN IF NOT EXISTS partner_type        TEXT NOT NULL DEFAULT 'sponsor'
                             CHECK (partner_type IN (
                               'headline_sponsor', 'platinum_sponsor', 'gold_sponsor',
                               'silver_sponsor', 'bronze_sponsor', 'exhibitor',
                               'media_partner', 'association_partner', 'ecosystem_partner',
                               'knowledge_partner', 'official_partner', 'supporting_partner',
                               'sponsor', 'other'
                             )),
  ADD COLUMN IF NOT EXISTS logo_raw_url        TEXT,       -- original uploaded file (any format)
  ADD COLUMN IF NOT EXISTS website_tile_url    TEXT,       -- generated partner tile (future use)
  ADD COLUMN IF NOT EXISTS announcement_status TEXT NOT NULL DEFAULT 'pending_review'
                             CHECK (announcement_status IN (
                               'pending_review', 'approved', 'assets_missing', 'ready', 'archived'
                             )),
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'manual'
                             CHECK (source IN ('onboarding_form', 'manual')),
  ADD COLUMN IF NOT EXISTS form_submission_id  UUID,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS created_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sponsors_announcement_status ON event_sponsors(event_id, announcement_status, partner_type);

-- ── 5. Onboarding Form Submissions (raw, before MM review) ─────────────────
CREATE TABLE IF NOT EXISTS stakeholder_form_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  form_type        TEXT NOT NULL
                     CHECK (form_type IN ('speaker', 'sponsor', 'media_partner', 'association_partner')),
  submitted_data   JSONB NOT NULL,   -- raw form fields
  file_urls        JSONB,            -- uploaded files { photo: url, logo: url }
  status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'processed', 'rejected')),
  processed_into   UUID,             -- event_speakers.id or event_sponsors.id, depending on form_type
  submitted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_event ON stakeholder_form_submissions(event_id, form_type, status);

-- ── 6. Announcements ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stakeholder_announcements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- What is being announced
  stakeholder_type TEXT NOT NULL CHECK (stakeholder_type IN ('speaker', 'partner')),
  speaker_id       UUID REFERENCES event_speakers(id) ON DELETE SET NULL,
  partner_id       UUID REFERENCES event_sponsors(id) ON DELETE SET NULL,
  -- Generated content
  post_copy        TEXT,             -- AI-generated post text
  creative_url     TEXT,             -- public storage URL of the final 1080×1350 Sharp-composited PNG
  creative_variant_id TEXT,          -- which named variant (events.creative_template_config.<type>.variants[].id) produced creative_url — lets regenerate-creative reuse it without the MM re-picking
  -- Approval
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft',            -- MM is working on it
                       'pending_approval', -- sent for approval
                       'approved',         -- all approvers approved
                       'approved_with_comments', -- approved but MM to make minor edits
                       'changes_requested',       -- approver asked for changes
                       'scheduled',        -- scheduled to post
                       'published',        -- successfully published
                       'failed'            -- publish failed
                     )),
  -- Scheduling
  scheduled_for    TIMESTAMPTZ,      -- when to post
  platforms        TEXT[],           -- ['LinkedIn', 'Instagram', 'X', 'YouTube']
  published_at     TIMESTAMPTZ,
  publish_results  JSONB,            -- { LinkedIn: { success: true, post_id: "..." }, ... }
  -- Metadata
  created_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_event  ON stakeholder_announcements(event_id, status);
CREATE INDEX IF NOT EXISTS idx_announcements_sched  ON stakeholder_announcements(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- ── 7. Announcement Approvals ────────────────────────────────────────────────
-- approval_token/token_expires_at mirror staff_members.reset_token/
-- reset_token_expires (see app/api/reset-password/route.ts) — lets an
-- approver with no EventPilot account action a request via a signed link.
CREATE TABLE IF NOT EXISTS announcement_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id   UUID NOT NULL REFERENCES stakeholder_announcements(id) ON DELETE CASCADE,
  approver_id       UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  approver_role     TEXT NOT NULL,  -- 'Production Lead', 'Commercial Director', etc. (display label)
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'approved_with_comments', 'changes_requested')),
  comments          TEXT,
  actioned_at       TIMESTAMPTZ,
  notified_at       TIMESTAMPTZ,    -- when the approval email was sent
  approval_token    TEXT UNIQUE,    -- signed link token, no login required
  token_expires_at  TIMESTAMPTZ,    -- 7-day expiry from notified_at
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_announcement ON announcement_approvals(announcement_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver     ON announcement_approvals(approver_id, status);

-- ── 8. Event roles (MM, Production Lead, CD etc per event) ─────────────────
-- Extends existing event_staff with named roles for the approval workflow.
-- Coexists with event_staff's existing free-text `role` column (general
-- assignment label) without conflict — event_role is specific to SAE's
-- approver-selection UI.
ALTER TABLE event_staff
  ADD COLUMN IF NOT EXISTS event_role TEXT
    CHECK (event_role IN (
      'marketing_manager',
      'production_lead',
      'commercial_director',
      'partnerships_lead',
      'media_lead',
      'operations_lead',
      'project_director'
    ));
