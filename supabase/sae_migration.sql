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
-- PRD v1.4 Phase C v4 (2026-07-26): real production creatives showed text
-- needs to match the brand's actual typography, not a hardcoded Arial/
-- Helvetica fallback (see app/lib/announcements/composite.ts). Added a
-- platform-level font library (brand_fonts, below) — deliberately not
-- SAE-scoped despite living in this migration file, since fonts are a
-- reusable brand asset, not per-event data. Branding team uploads or
-- fetches-by-name from Google Fonts once; any text layer in any event's
-- creative_template_config can reference a brand_fonts row thereafter.
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

-- ── 9. Platform-level font library (Phase C v4, 2026-07-26) ─────────────────
-- Not event-scoped — a font uploaded/fetched once is selectable from any
-- text layer's Font Family dropdown in any event's Creative Templates editor.
CREATE TABLE IF NOT EXISTS brand_fonts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_name        TEXT NOT NULL,               -- display name, e.g. "Poppins"
  source             TEXT NOT NULL CHECK (source IN ('upload', 'google_fonts')),
  google_font_family TEXT,                        -- exact Google Fonts family name, if source = 'google_fonts'
  regular_url        TEXT NOT NULL,                -- public storage URL, weight 400
  bold_url           TEXT,                         -- public storage URL, weight 700 (nullable — some uploads only provide one weight)
  created_by         UUID,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 2026-07-27: case-insensitive uniqueness — closes a real race condition
-- found via live testing of the bulk drag-and-drop font uploader
-- (app/api/branding/fonts/bulk-upload/route.ts): two near-simultaneous
-- requests for the same family could both see "no existing row" and both
-- insert, producing duplicate library entries. Applied live via
-- `supabase db query --linked` (pooler DNS unreliable for this project,
-- same workaround noted elsewhere in HANDOFF.md).
CREATE UNIQUE INDEX IF NOT EXISTS brand_fonts_family_name_lower_idx ON brand_fonts (LOWER(family_name));

-- 2026-07-28: fixes a real gap found while building the Clean Logo Base
-- generator — the speaker company-logo upload route (app/api/events/
-- stakeholders/speakers/[id]/upload-asset/route.ts) already uploaded the
-- raw file to storage but never persisted its URL anywhere, silently
-- discarding it (only the processed company_logo_url was saved). Matches
-- event_sponsors.logo_raw_url, which the partner flow already does correctly.
ALTER TABLE event_speakers
  ADD COLUMN IF NOT EXISTS company_logo_raw_url TEXT; -- original uploaded file (any format), before the Logo Engine's processing

-- 2026-07-30: fixes a real bug found live — Madhu regenerated a creative
-- after only touching an unrelated layer (the company logo box) and the
-- speaker's PHOTO crop shifted anyway. Root cause: alignAndCropPhoto()
-- (app/lib/media/face-alignment.ts) never cached where a speaker's head
-- actually sits in their photo — it re-ran a fresh Gemini vision call on
-- every single generate/regenerate, and LLM-based detection isn't
-- perfectly deterministic call-to-call, so the exact same photo could
-- crop slightly differently each time. Caching the detected box once
-- (at upload/crop time, since cropping changes the pixel content) and
-- reusing it makes every subsequent generation of that photo produce an
-- identical crop, only recomputing when the photo itself actually changes.
ALTER TABLE event_speakers
  ADD COLUMN IF NOT EXISTS photo_head_box JSONB; -- { centerXRatio, centerYRatio, heightRatio } from detectHeadBox() — null falls back to live per-call detection (legacy photos uploaded before this column existed)

-- 2026-08-04: full font-weight support (was regular/bold only) — per
-- Madhu: "for most of our google fonts or custom fonts we also use font
-- weight option too instead of just using regular/bold/italics." Real
-- technical unlock found live: Google's css2 API serves almost its whole
-- catalog as ONE variable-font file regardless of which weight you
-- request (confirmed: 5 different weight requests for Space Grotesk all
-- resolved to the identical gstatic URL) — but requesting with an old
-- Android User-Agent (pre-variable-font browser support) forces Google to
-- serve genuinely distinct static per-weight files instead (confirmed via
-- SHA-256: 5 different hashes, 5 different byte lengths). @napi-rs/canvas
-- (the renderer — see composite.ts) can register any number of font files
-- under the SAME family name and correctly select between them via a
-- NUMERIC ctx.font weight (confirmed live: 5 weights registered together
-- rendered 5 visibly distinct weights). regular_url/bold_url stay as they
-- are for every existing consumer and existing row — weights is purely
-- additive, populated going forward by both the Google Fonts fetch and
-- the bulk custom-font uploader.
ALTER TABLE brand_fonts
  ADD COLUMN IF NOT EXISTS weights JSONB; -- { "300": url, "400": url, "700": url, ... } — numeric weight (100-900) -> public storage URL, only genuinely distinct files ever stored (byte-deduped against variable-font false positives)

-- 2026-08-05: conversational section-level edits to the Topline Messaging
-- Doc. structured_json (see section 2 above) moved from a fixed 6-key
-- schema to a dynamic { sections: [{ id, order, title, kind, content,
-- updated_at, updated_by, change_note }] } shape, editable one section at
-- a time via a propose -> human-approve -> apply chat flow. Deliberately
-- NOT full document version snapshots per edit — that's speculative
-- complexity nobody asked for. Each section already carries its own
-- updated_at/change_note inline; this table is the append-only audit
-- trail of every applied edit (what changed, why, who approved it),
-- which is what "what changed and when" actually needs. Restoring a past
-- section's exact prior content is possible later from before_excerpt if
-- it ever becomes a real requirement, but isn't built now.
CREATE TABLE IF NOT EXISTS event_messaging_doc_edits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  doc_id          UUID NOT NULL REFERENCES event_messaging_docs(id) ON DELETE CASCADE,
  section_id      TEXT NOT NULL,
  instruction     TEXT NOT NULL,       -- the user's original chat message that caused this edit
  before_excerpt  TEXT,
  after_excerpt   TEXT,
  applied_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  applied_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_doc_edits_doc ON event_messaging_doc_edits(doc_id, applied_at);

-- 2026-08-16: Postiz channel selection. Real-world discovery while wiring
-- up the actual publish/schedule UI: the Postiz public API (verified
-- directly against docs.postiz.com — see app/lib/postiz.ts's own rewrite
-- comment) targets specific CONNECTED CHANNELS by their own integration
-- id (a post can go to any subset of however many channels a workspace
-- has connected — LinkedIn, X, Instagram, etc., including multiple of the
-- same platform type), not a platform-type string like the existing
-- `stakeholder_announcements.platforms TEXT[]` column assumed. That
-- column is left in place (unused going forward, harmless) rather than
-- repurposed, since integration ids are opaque and a column named
-- "platforms" holding them would be misleading to anyone reading the row
-- directly.
--
-- Two new columns, matching Madhu's ask (2026-08-16): a per-event
-- remembered DEFAULT channel selection (so posting never requires
-- re-picking channels from scratch), and a per-announcement selection
-- that starts pre-filled from that default the first time a post is
-- opened for scheduling, but can be freely adjusted per post from there
-- without touching the event's own default.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS postiz_default_channel_ids TEXT[]; -- Postiz integration ids, this event's remembered default channel selection

ALTER TABLE stakeholder_announcements
  ADD COLUMN IF NOT EXISTS postiz_channel_ids TEXT[]; -- Postiz integration ids actually targeted by this post — pre-filled from events.postiz_default_channel_ids, editable per post

-- 2026-08-18: Self Promo module + speaker data quality. Building a second
-- creative flow (org posts on Trescon's own channels vs. a creative +
-- copy emailed TO the speaker for them to post themselves) surfaced a
-- real, separate gap worth fixing at the same time: creatives/post copy
-- only ever had the speaker's raw `name` to work with — no way to
-- override it with the exact publicly-correct form (honorifics/spelling),
-- no way to know how to refer to the person in third person, no way to
-- ground copy in anything more specific than a generic bio, and no way
-- to address them correctly in email. All four are producer-controlled
-- data gaps, not AI-prompt gaps — fixing them improves the existing,
-- already-shipped org-promo flow too, not just the new self-promo one.
--
-- public_name mirrors events.public_name's existing override pattern
-- (nullable, `?? name` fallback everywhere public content is generated).
--
-- salutation: a real "Salutation" field already exists on the live
-- onboarding form (confirmed against the actual worldaishow.com/malaysia
-- form) but was never mapped to any real EventPilot concept — it's been
-- landing nowhere usable. Promoting it to a first-class column so it can
-- be relied on in every speaker email communication, not just captured
-- and lost in a generic per-event custom field.
--
-- pronoun_style: closed set, third-person reference style for org-promo
-- copy only (self-promo is first-person "I/my", doesn't need this).
-- Extending this list later needs DROP CONSTRAINT + ADD CONSTRAINT, not
-- IF NOT EXISTS — same recurring cost as announcement_status's own
-- history in this file (see its CHECK constraint above). Kept
-- intentionally small; add options only when a real need shows up.
--
-- key_talking_points: free text, referenced by both the org-promo and
-- self-promo copy generators when present.
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS public_name TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS salutation TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS key_talking_points TEXT;
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS pronoun_style TEXT
  CHECK (pronoun_style IN ('he_him','she_her','his_excellency','her_excellency','his_highness','her_highness'));

-- Distinguishes the new Self Promo flow's rows from the existing org-promo
-- ones. NOT NULL DEFAULT so every existing row is unaffected — mirrors
-- event_sponsors.partner_type's own NOT NULL DEFAULT pattern.
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS announcement_kind TEXT
  NOT NULL DEFAULT 'org_promo' CHECK (announcement_kind IN ('org_promo','self_promo'));

-- Audit/send record for the new "send this creative to the speaker"
-- email flow. Deliberately a dedicated table, not a reuse of
-- stakeholder_invites (FK'd to form_type — a different concept, onboarding
-- invites not creative sends) and not just email_template_sends alone
-- (generic audit only, no announcement linkage, no cc list) — need to be
-- able to answer "was this specific announcement ever sent, to whom, with
-- what cc list" later, same as the invite flow already can for itself.
CREATE TABLE IF NOT EXISTS stakeholder_announcement_sends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id   UUID NOT NULL REFERENCES stakeholder_announcements(id) ON DELETE CASCADE,
  template_id       UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  recipient_name    TEXT NOT NULL,
  recipient_email   TEXT NOT NULL,
  cc_emails         TEXT[],
  actual_subject    TEXT,
  actual_body_html  TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','failed')),
  send_error        TEXT,
  sent_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcement_sends_announcement ON stakeholder_announcement_sends(announcement_id);
