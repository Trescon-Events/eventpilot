# EventPilot — Stakeholder Announcement Engine
## Product Requirements Document v1.4

**Feature name:** Stakeholder Announcement Engine (SAE)
**Pilot event:** World AI Show Malaysia 2026
**Date:** July 2026
**Author:** Madhukar Dudda, Trescon
**Classification:** Internal — Trescon Confidential

**Changelog:**
- v1.0: Initial PRD (Ayrshare, remove.bg, Google Maps API, Canva Autofill)
- v1.1: Replaced Ayrshare with self-hosted Postiz
- v1.2: Replaced remove.bg → PhotoRoom; Google Maps API → plain URL field
- v1.3: Replaced Postiz self-hosted → Postiz Cloud ($39/month)
- v1.4: **Replaced Canva Autofill API → Sharp image compositing.**
  Canva's Autofill API requires Brand Templates with data fields configured
  through a specific enterprise workflow. Investigation confirmed this is not
  available in the standard Canva for Teams template editor — the "Connect data"
  option does not appear on image or text elements. Rather than blocking the
  entire creative generation pipeline on a Canva API limitation, we pivot to
  Sharp-based server-side image compositing. The creative quality is identical.
  The Canva OAuth integration remains in place for future use but is NOT used
  for creative generation in this sprint.

---

## 0. How to Read This PRD

This PRD is handed off to Claude Code. Before writing a single line of code:

1. Read the entire codebase via the eventpilot MCP connector
2. Read `CLAUDE.md` and `HANDOFF.md`
3. Read this PRD in full
4. Analyse against the current codebase — flag conflicts, redundancies, or better approaches
5. Propose a phased implementation plan and confirm with Madhu before coding

**Do not start coding until Madhu confirms the plan.**

---

## 1. What This Builds — Plain English

When Trescon onboards a speaker or sponsor/partner for an event, they need to announce it on social media. Currently fully manual: collect details via HubSpot forms, design creatives in Canva, write copy manually, get approvals over WhatsApp/email, post manually on each channel.

This module automates that entire workflow from data collection to published post, with humans in the loop at the right checkpoints.

**The flow:**
1. Stakeholder fills an onboarding form on the event website → data lands in EventPilot
2. Marketing Manager reviews and enriches the data (edits, uploads missing photos/logos)
3. MM clicks "Generate Announcement" → EventPilot composites the creative using Sharp + generates post copy using Gemini
4. MM reviews creative + copy, edits if needed, selects who should approve
5. Approvers notified by email with direct link → approve/reject/comment in EventPilot
6. MM schedules the post → Postiz Cloud publishes to the event's social channels
7. Done. One announcement that previously took 45–60 minutes takes under 5 minutes.

---

## 2. Current Codebase State — What Already Exists

**Read these files before touching anything:**

```
app/admin/events/[id]/page.tsx         — event workspace (giant file, all tabs)
app/admin/events/[id]/brand/           — Brand Studio
app/admin/events/[id]/brief/           — Event Brief
app/admin/events/[id]/website/         — Website Builder
app/api/canva/route.ts                 — Canva OAuth (keep — future use)
app/api/canva/design/route.ts          — Canva API (keep — future use, NOT used for creative generation)
supabase/canva_integration.sql         — canva_tokens table
supabase/social_accounts.sql           — event_social_accounts table
supabase/content_engine.sql            — content_campaigns, content_posts tables
app/content/                           — Content Engine
```

**Critical constraints:**
- Storage: Cloudflare R2 (`KB_R2_*` env vars) — NOT AWS S3
- All styles: inline, no CSS framework, Manrope font, `--surface: #0A121A`, `--card: #142330`, `--teal-mid: #12C9BD`, `--lime: #C0F43C`
- Auth: `staff_members.access_roles TEXT[]` array
- Cron jobs: cron-job.org with `Authorization: Bearer` — NOT Railway cron
- The event workspace at `/admin/events/[id]/page.tsx` is ONE large file — extend it, never rebuild it
- **Canva Autofill API is NOT used for creative generation** — see Section 7 for the Sharp compositing approach

---

## 3. Architecture Overview

```
EVENT PROFILE (extended)
    ↓ provides context to all tools
TOPLINE MESSAGING DOC (per event, version-controlled PDF → structured JSON)
    ↓ used by Gemini for post copy generation
STAKEHOLDER REGISTRY (speakers / sponsors / partners per event)
    ↓ populated via
ONBOARDING FORMS (public, on event website) OR manual entry by MM
    ↓ MM reviews + enriches data + uploads/approves assets
ANNOUNCEMENT ENGINE
    ├── Gemini generates post copy (grounded in messaging doc + stakeholder data)
    ├── PhotoRoom API strips speaker photo background → transparent PNG
    ├── Sharp composites the creative:
    │     background template PNG (from R2)
    │     + stakeholder photo/logo (from R2)
    │     + text layers (name, title, company, tier label)
    │     → final 1080×1350 PNG → uploaded to R2
    ├── Approval workflow (MM selects approvers → Resend email → in-app review page)
    └── Postiz Cloud schedules + publishes to social channels
```

---

## 4. Database Migration

Create `supabase/sae_migration.sql`. Safe to run multiple times.

```sql
-- ── 4.1 Extend events table ────────────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_format     TEXT CHECK (event_format IN ('physical','virtual','hybrid')),
  ADD COLUMN IF NOT EXISTS country          TEXT,
  ADD COLUMN IF NOT EXISTS website_url      TEXT,
  ADD COLUMN IF NOT EXISTS end_date         DATE,
  ADD COLUMN IF NOT EXISTS event_hashtag    TEXT,
  ADD COLUMN IF NOT EXISTS registration_url TEXT;

-- ── 4.2 Event social channel URLs (for display, not OAuth) ────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS social_linkedin  TEXT,
  ADD COLUMN IF NOT EXISTS social_x         TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram TEXT,
  ADD COLUMN IF NOT EXISTS social_facebook  TEXT,
  ADD COLUMN IF NOT EXISTS social_youtube   TEXT;

-- ── 4.3 Venue map link (plain URL — no Maps API) ──────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS venue_map_url TEXT;

-- ── 4.4 Creative template config per event ────────────────────────────────────
-- Stores R2 URLs of background PNGs and layout config for Sharp compositing.
-- Replaces canva_template_config from earlier PRD versions.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS creative_template_config JSONB;

-- Structure of creative_template_config:
-- {
--   "speaker": {
--     "background_url": "r2:events/{id}/templates/speaker-bg.png",
--     "canvas_width": 1080,
--     "canvas_height": 1350,
--     "photo_zone": { "x": 0, "y": 0, "width": 1080, "height": 900 },
--     "name_text": { "x": 60, "y": 920, "font_size": 52, "font_color": "#FFFFFF", "font_weight": "bold" },
--     "title_text": { "x": 60, "y": 990, "font_size": 28, "font_color": "#12C9BD" },
--     "company_text": { "x": 60, "y": 1035, "font_size": 26, "font_color": "#FFFFFF" },
--     "logo_zone": { "x": 800, "y": 920, "width": 220, "height": 100 }
--   },
--   "partner": {
--     "headline_sponsor": {
--       "background_url": "r2:events/{id}/templates/partner-bg.png",
--       "canvas_width": 1080,
--       "canvas_height": 1350,
--       "logo_zone": { "x": 190, "y": 310, "width": 700, "height": 220 },
--       "tier_text": { "x": 540, "y": 548, "font_size": 28, "font_color": "#FFFFFF",
--                      "align": "center", "value": "LEAD SPONSOR" }
--     },
--     "gold_sponsor": { ... },
--     "silver_sponsor": { ... },
--     "bronze_sponsor": { ... },
--     "exhibitor": { ... },
--     "media_partner": { ... },
--     "association_partner": { ... }
--   }
-- }

-- ── 4.5 Postiz profile key per event ──────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS postiz_profile_key TEXT;

-- ── 4.6 Topline Messaging Documents ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_messaging_docs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  title           TEXT NOT NULL,
  raw_text        TEXT,
  structured_json JSONB,
  source_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','live','superseded')),
  superseded_by   UUID REFERENCES event_messaging_docs(id) ON DELETE SET NULL,
  uploaded_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_docs_event ON event_messaging_docs(event_id, status);

-- ── 4.7 Speakers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_speakers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  job_title           TEXT NOT NULL,
  company_name        TEXT NOT NULL,
  country             TEXT,
  bio                 TEXT,
  linkedin_url        TEXT,
  photo_url           TEXT,           -- original uploaded photo (R2)
  photo_processed_url TEXT,           -- background-removed PNG (PhotoRoom → R2)
  company_logo_url    TEXT,           -- optional company logo (R2)
  website_card_url    TEXT,           -- future: generated speaker card for event website
  status              TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','approved','assets_missing','ready')),
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('onboarding_form','manual')),
  form_submission_id  UUID,
  notes               TEXT,
  created_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speakers_event ON event_speakers(event_id, status);

-- ── 4.8 Partners ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_partners (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  company_name        TEXT NOT NULL,
  company_website     TEXT,
  company_description TEXT,
  partner_type        TEXT NOT NULL DEFAULT 'sponsor'
                        CHECK (partner_type IN (
                          'headline_sponsor','platinum_sponsor','gold_sponsor',
                          'silver_sponsor','bronze_sponsor','exhibitor',
                          'media_partner','association_partner','ecosystem_partner',
                          'knowledge_partner','official_partner','supporting_partner','other'
                        )),
  logo_url            TEXT,           -- processed/clean logo (R2)
  logo_raw_url        TEXT,           -- original upload (R2) — any format
  website_tile_url    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','approved','assets_missing','ready')),
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('onboarding_form','manual')),
  form_submission_id  UUID,
  notes               TEXT,
  created_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_event ON event_partners(event_id, status, partner_type);

-- ── 4.9 Onboarding Form Submissions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stakeholder_form_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  form_type      TEXT NOT NULL
                   CHECK (form_type IN ('speaker','sponsor','media_partner','association_partner')),
  submitted_data JSONB NOT NULL,
  file_urls      JSONB,
  status         TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','processed','rejected')),
  processed_into UUID,
  submitted_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_event ON stakeholder_form_submissions(event_id, form_type, status);

-- ── 4.10 Announcements ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stakeholder_announcements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stakeholder_type TEXT NOT NULL CHECK (stakeholder_type IN ('speaker','partner')),
  speaker_id       UUID REFERENCES event_speakers(id) ON DELETE SET NULL,
  partner_id       UUID REFERENCES event_partners(id) ON DELETE SET NULL,
  post_copy        TEXT,
  creative_url     TEXT,       -- R2 URL of final 1080×1350 PNG (Sharp output)
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft','pending_approval','approved',
                       'approved_with_comments','changes_requested',
                       'scheduled','published','failed'
                     )),
  scheduled_for    TIMESTAMPTZ,
  platforms        TEXT[],     -- ['LinkedIn','Instagram','X','YouTube']
  postiz_post_id   TEXT,
  published_at     TIMESTAMPTZ,
  publish_results  JSONB,
  created_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_event ON stakeholder_announcements(event_id, status);
CREATE INDEX IF NOT EXISTS idx_announcements_sched ON stakeholder_announcements(scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- ── 4.11 Announcement Approvals ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcement_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES stakeholder_announcements(id) ON DELETE CASCADE,
  approver_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  approver_role   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','approved_with_comments','changes_requested')),
  comments        TEXT,
  actioned_at     TIMESTAMPTZ,
  notified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_announcement ON announcement_approvals(announcement_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver     ON announcement_approvals(approver_id, status);

-- ── 4.12 Extend event_social_accounts to add X and YouTube ───────────────────
ALTER TABLE event_social_accounts
  DROP CONSTRAINT IF EXISTS event_social_accounts_platform_check;

ALTER TABLE event_social_accounts
  ADD CONSTRAINT event_social_accounts_platform_check
  CHECK (platform IN ('Facebook','Instagram','LinkedIn','X','YouTube'));

-- ── 4.13 Event roles per event staff ──────────────────────────────────────────
ALTER TABLE event_staff
  ADD COLUMN IF NOT EXISTS event_role TEXT
    CHECK (event_role IN (
      'marketing_manager','production_lead','commercial_director',
      'partnerships_lead','media_lead','operations_lead','project_director'
    ));
```

---

## 5. Environment Variables

```
PHOTOROOM_API_KEY=      # photoroom.com/api — background removal, ~$0.02/image
POSTIZ_API_URL=https://api.postiz.com
POSTIZ_API_KEY=         # from Postiz dashboard → Settings → API Keys
```

**Not needed (removed from earlier versions):**
- ~~REMOVEBG_API_KEY~~ ~~GOOGLE_MAPS_API_KEY~~ ~~AYRSHARE_API_KEY~~ ~~POSTIZ_INTERNAL_URL~~ ~~canva_template_config~~

---

## 5a. PhotoRoom API

```typescript
const formData = new FormData()
formData.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' })
formData.append('output_type', 'rgba')
const response = await fetch('https://sdk.photoroom.com/v1/segment', {
  method: 'POST',
  headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY },
  body: formData,
})
// Response: binary transparent PNG → upload to R2 as photo_processed_url
```

---

## 5b. Postiz Cloud

See Section 6.10 for API call structure. Madhu signs up at platform.postiz.com (Team plan, $39/month), connects social accounts, generates API keys.

---

## 6. API Endpoints

### 6.1 Event Profile PATCH

Extend existing handler to save: `event_format`, `country`, `website_url`, `social_*`, `venue_map_url`, `event_hashtag`, `registration_url`, `postiz_profile_key`, `creative_template_config`.

### 6.2 Creative Template Upload

**POST /api/events/templates/upload**
Body: `multipart/form-data` with `file` (PNG), `event_id`, `template_type` ('speaker' | 'partner'), `partner_tier?`

1. Validate PNG, max 10MB
2. Upload to R2 at `events/{event_id}/templates/{template_type}-{tier?}-bg.png`
3. Return `{ r2_url }`

Admin uses this to upload the background PNGs exported from Canva.
After uploading, the MM updates `creative_template_config` in the event profile with the layout coordinates.

**GET /api/events/templates?event_id={id}**
Returns all template background URLs for this event.

### 6.3 Topline Messaging Doc

**POST /api/events/messaging** — upload PDF → R2 → Gemini extracts → structured_json → saves as live
**GET /api/events/messaging?event_id={id}**
**PATCH /api/events/messaging/[id]**

### 6.4 Speakers

**GET /api/events/speakers?event_id={id}&status={status}**
**POST /api/events/speakers**
**PATCH /api/events/speakers/[id]**
**DELETE /api/events/speakers/[id]**

**POST /api/events/speakers/[id]/upload-asset**
`asset_type: 'photo' | 'company_logo'`
For photo: upload to R2 → call PhotoRoom → upload processed PNG to R2
For logo: upload to R2 as-is

### 6.5 Partners

**GET /api/events/partners?event_id={id}&type={}&status={}**
**POST /api/events/partners**
**PATCH /api/events/partners/[id]**
**DELETE /api/events/partners/[id]**
**POST /api/events/partners/[id]/upload-asset** — accepts PNG, JPG, SVG, PDF, AI

### 6.6 Public Onboarding Forms

**GET /api/public/forms/[event_id]/[form_type]**
**POST /api/public/forms/[event_id]/[form_type]** — validates, uploads files to R2, inserts submission, sends emails

### 6.7 Form Processing

**POST /api/events/speakers/from-submission**
**POST /api/events/partners/from-submission**

### 6.8 Announcement Generation

**POST /api/events/announcements/generate**

```typescript
Body: {
  event_id: string
  stakeholder_type: 'speaker' | 'partner'
  speaker_id?: string
  partner_id?: string
  use_company_logo?: boolean  // speakers only: overlay company logo instead of text
}
```

**Sequence:**

**Step 1 — Load data**
- Load stakeholder (speaker or partner)
- Load event (name, dates, venue, city, hashtag, registration_url, creative_template_config)
- Load live messaging doc structured_json

**Step 2 — Generate post copy via Gemini**
```
System: You write social media announcement posts for Trescon events.
Voice: confident, data-driven, forward-looking. Never fabricate.

Event: {name}, {edition}th Global Edition, {dates}, {venue}, {city}
Hashtag: {event_hashtag}
Registration: {registration_url}
Positioning: {structured_json.positioning_statement}
Tone: {structured_json.tone_of_voice}
Key messages: {structured_json.key_messages}

Stakeholder: {all fields}
Post type: {speaker | partner_type} announcement

Generate LinkedIn post (max 1300 chars):
- Hook: 1-2 sentences on why this person/company matters
- 2-3 sentences expanding on their relevance to this audience
- Event dates and venue
- CTA with registration_url
- Hashtags: {event_hashtag} + 4-6 topic hashtags

Return JSON only: { "copy": "...", "hashtags": ["#..."] }
```

**Step 3 — Composite creative via Sharp**

See Section 7 for the full compositing logic.

**Step 4 — Save and return**
- Create `stakeholder_announcements` row (status: `draft`)
- Return `{ announcement_id, post_copy, creative_url }`

**POST /api/events/announcements/[id]/regenerate-copy**
**POST /api/events/announcements/[id]/regenerate-creative**

### 6.9 Approval Workflow

**POST /api/events/announcements/[id]/send-for-approval**
Body: `{ approvers: [{ staff_id, role_label }] }`
Creates approval rows, sets `pending_approval`, sends Resend email with creative image + signed URL.

**POST /api/events/announcements/[id]/approve**
Body: `{ approver_id, token, status, comments? }`
Validates signed token, updates approval, checks all actioned, notifies MM.

### 6.10 Scheduling (Postiz Cloud)

**POST /api/events/announcements/[id]/schedule**
```typescript
await fetch(`${process.env.POSTIZ_API_URL}/api/v1/posts`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.POSTIZ_API_KEY}`,
    'X-Profile-Key': event.postiz_profile_key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    content: announcement.post_copy,
    platforms: announcement.platforms.map(p => p.toLowerCase()),
    date: announcement.scheduled_for,
    media: [{ url: announcement.creative_url }],
  }),
})
```

**POST /api/events/announcements/[id]/publish-now** — same, no `date`

**POST /api/cron/announcements/sync-status** — cron-job.org every 15 min, marks published/failed

### 6.11 Social Calendar

**GET /api/events/announcements?event_id={id}&month={YYYY-MM}**

---

## 7. Creative Generation — Sharp Compositing (replaces Canva Autofill)

### Why Sharp Instead of Canva Autofill

Canva's Autofill API requires templates to have data fields configured through a specific enterprise developer workflow. Investigation confirmed this is not available through the standard Canva for Teams template editor — the "Connect data" option does not appear on image or text elements when right-clicking inside a published Brand Template. Canva's "Bulk Create" feature is a manual browser-based tool, not an API.

Rather than blocking creative generation on this Canva API limitation, we use **Sharp** — a high-performance Node.js image processing library — to composite the creative server-side. The output is visually identical to what the design team produces manually in Canva. Canva remains the tool for designing and updating templates; EventPilot just uses the exported backgrounds.

### How It Works

The design team exports the template backgrounds from Canva as PNG files (blank — no dynamic content). These are uploaded to R2 once per event per template type. When EventPilot generates an announcement, Sharp:

1. Loads the background PNG from R2
2. Resizes and positions the speaker photo or partner logo onto it
3. Renders text overlays (name, title, company, tier label)
4. Outputs a finished 1080×1350 PNG

No Canva API call happens during generation. The Canva templates are the source of design truth; EventPilot just composites the data onto them.

### Install Sharp

```bash
npm install sharp
```

Sharp is a mature, widely-used library with native binaries for Linux (Railway). No additional config needed.

### The Compositing Function

Create `app/lib/announcements/composite.ts`:

```typescript
import sharp from 'sharp'

export interface CompositeConfig {
  background_url: string       // R2 public URL of the background PNG
  canvas_width: number         // 1080
  canvas_height: number        // 1350
  // For speakers:
  photo_zone?: {
    x: number, y: number,
    width: number, height: number
  }
  // For partners:
  logo_zone?: {
    x: number, y: number,
    width: number, height: number,
    background?: string          // e.g. '#FFFFFF' — fill behind logo if needed
  }
  // Text layers
  name_text?: TextLayer
  title_text?: TextLayer
  company_text?: TextLayer
  tier_text?: TextLayer          // e.g. "LEAD SPONSOR" — value hardcoded per partner_type
}

interface TextLayer {
  x: number
  y: number
  font_size: number
  font_color: string             // hex e.g. '#FFFFFF'
  font_weight?: 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  max_width?: number             // truncate/wrap at this pixel width
  value?: string                 // hardcoded value (for tier labels)
}

export async function compositeAnnouncement(
  config: CompositeConfig,
  assets: {
    photo_or_logo_buffer: Buffer    // the speaker photo (bg-removed) or partner logo
    is_svg?: boolean                // partner logos may be SVG
  },
  texts: {
    name?: string
    title?: string
    company?: string
    tier?: string
  }
): Promise<Buffer> {

  // 1. Fetch background from R2
  const bgResponse = await fetch(config.background_url)
  const bgBuffer = Buffer.from(await bgResponse.arrayBuffer())

  // 2. Prepare the photo or logo
  let assetBuffer = assets.photo_or_logo_buffer
  if (assets.is_svg) {
    // Convert SVG to PNG via Sharp before compositing
    assetBuffer = await sharp(assetBuffer).png().toBuffer()
  }

  const compositeOps: sharp.OverlayOptions[] = []

  // 3. Resize and position photo/logo
  const zone = config.photo_zone || config.logo_zone
  if (zone) {
    // If partner logo needs a white background card, create it first
    if (config.logo_zone?.background) {
      const bgCard = await sharp({
        create: {
          width: zone.width,
          height: zone.height,
          channels: 4,
          background: config.logo_zone.background,
        }
      }).png().toBuffer()

      compositeOps.push({ input: bgCard, left: zone.x, top: zone.y })
    }

    // Resize asset to fit zone, maintaining aspect ratio
    const resized = await sharp(assetBuffer)
      .resize(zone.width, zone.height, { fit: 'inside', withoutEnlargement: false })
      .toBuffer()

    const metadata = await sharp(resized).metadata()
    const assetWidth = metadata.width ?? zone.width
    const assetHeight = metadata.height ?? zone.height

    // Center within zone
    const leftOffset = zone.x + Math.floor((zone.width - assetWidth) / 2)
    const topOffset = zone.y + Math.floor((zone.height - assetHeight) / 2)

    compositeOps.push({ input: resized, left: leftOffset, top: topOffset })
  }

  // 4. Text overlays via SVG
  const textSvgs = buildTextSvg(config, texts, config.canvas_width, config.canvas_height)
  if (textSvgs) {
    compositeOps.push({ input: Buffer.from(textSvgs), top: 0, left: 0 })
  }

  // 5. Composite everything onto background
  const result = await sharp(bgBuffer)
    .resize(config.canvas_width, config.canvas_height)
    .composite(compositeOps)
    .png()
    .toBuffer()

  return result
}

function buildTextSvg(
  config: CompositeConfig,
  texts: { name?: string; title?: string; company?: string; tier?: string },
  width: number,
  height: number
): string | null {
  const layers: string[] = []

  const addText = (layer: TextLayer | undefined, value: string | undefined) => {
    if (!layer || !value) return
    const weight = layer.font_weight === 'bold' ? 'bold' : 'normal'
    const anchor = layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start'
    const xPos = layer.align === 'center' ? layer.x + (layer.max_width ?? 0) / 2 : layer.x
    // Escape XML special characters
    const safe = value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    layers.push(
      `<text x="${xPos}" y="${layer.y}" font-size="${layer.font_size}" fill="${layer.font_color}"
       font-weight="${weight}" text-anchor="${anchor}"
       font-family="Arial, Helvetica, sans-serif">${safe}</text>`
    )
  }

  addText(config.name_text, texts.name)
  addText(config.title_text, texts.title)
  addText(config.company_text, texts.company)
  addText(config.tier_text, texts.tier || config.tier_text?.value)

  if (layers.length === 0) return null
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${layers.join('')}</svg>`
}
```

### How the Generate Endpoint Uses It

```typescript
// In POST /api/events/announcements/generate

import { compositeAnnouncement } from '@/lib/announcements/composite'

// Load the right template config
const templateConfig = event.creative_template_config?.speaker
  ?? event.creative_template_config?.partner?.[partner.partner_type]

if (!templateConfig) {
  return NextResponse.json({ error: 'No template configured for this event' }, { status: 400 })
}

// Fetch the asset (speaker photo or partner logo) from R2
const assetUrl = stakeholderType === 'speaker'
  ? (use_company_logo ? speaker.company_logo_url : speaker.photo_processed_url)
  : partner.logo_url

const assetResponse = await fetch(assetUrl)
const assetBuffer = Buffer.from(await assetResponse.arrayBuffer())
const isSvg = assetUrl.endsWith('.svg')

// Composite
const creativeBuffer = await compositeAnnouncement(
  templateConfig,
  { photo_or_logo_buffer: assetBuffer, is_svg: isSvg },
  {
    name: speaker?.full_name,
    title: speaker?.job_title,
    company: speaker?.company_name,
    tier: partner ? formatTierLabel(partner.partner_type) : undefined,
  }
)

// Upload to R2
const creativeKey = `events/${event_id}/announcements/${announcementId}/creative.png`
await putObject(creativeKey, creativeBuffer, 'image/png')
const creativeUrl = `r2:${creativeKey}`
```

### Font Note

Sharp renders text via SVG → the fonts available are system fonts on the Railway Linux container (Arial, Helvetica, sans-serif). The WAIS Malaysia templates use custom fonts in Canva, but the text in the output will render in Arial. **This is acceptable for the pilot.** If exact font matching is required later, we can embed custom fonts via a Buffer and reference them in the SVG `@font-face`.

---

## 8. Template Setup (What Madhu Does in Canva)

### What to Export from Canva

For each template (Speaker, Sponsor-Partner), export two versions:

**Version A — Reference only (keep in Canva, do not upload to EventPilot)**
The full finished template with real content (Datadog logo, real speaker photo, "LEAD SPONSOR" text). This is the design master. Keep it in Canva for the design team to update when needed.

**Version B — The background PNG (upload to EventPilot)**
The same template with ALL dynamic content removed:
- Speaker template: remove the speaker photo, remove the name text, remove the job title text, remove the company name text, remove the company logo (if present). Keep the background, the event logo, the dates, the venue, the "MEET OUR SPEAKER" badge, all decorative elements.
- Sponsor template: remove the company logo from the white card area (leave the white card), remove the "LEAD SPONSOR" text. Keep everything else.

Export as PNG at 1080×1350px. These backgrounds are uploaded to EventPilot once and stored in R2.

### After Uploading Backgrounds

After Madhu uploads the background PNGs, the MM fills in the layout coordinates in `creative_template_config` in the event profile. To find the correct coordinates:

Open the background PNG in any image viewer, use the cursor position to find:
- Where the photo/logo zone starts (x, y) and its width/height
- Where each text line should appear (x, y)

These are pixel coordinates on the 1080×1350 canvas.

For the pilot, Claude Code can provide a simple coordinate helper tool or Madhu can share the backgrounds and we derive the coordinates visually.

---

## 9. UI

### 9.1 Stakeholder Hub in Event Lifecycle

Add to Phase 3 (Public-Facing Assets) in the event workspace lifecycle flow:
```
[Website Builder]  [Content Campaigns]  [Stakeholder Hub ▶]
```
Links to `/admin/events/[id]/stakeholders`

### 9.2 Event Profile Extended Fields

Add to the existing event edit form:
```
── DIGITAL PRESENCE ──────────────────────────────────────────
Event Format:     [Physical ●] [Virtual ○] [Hybrid ○]
Country:          [text]
Website URL:      [text]
Registration URL: [text]
Event Hashtag:    [text]  e.g. #WAISMalaysia

── SOCIAL CHANNELS ───────────────────────────────────────────
LinkedIn / X / Instagram / YouTube / Facebook: [URL text inputs]

── VENUE MAP ─────────────────────────────────────────────────
Venue Map Link:  [text]
Help: "Search venue in Google Maps → Share → Copy Link → paste here"
When saved: show teal "View Map ↗" link

── CREATIVE TEMPLATES ────────────────────────────────────────
Speaker Background:     [Upload PNG ▲]  [preview thumb if set]
Partner Background:     [Upload PNG ▲]  [preview thumb if set]
  (separate upload per partner tier if different backgrounds)
Layout Config:          [Edit JSON ▶]   (advanced — for coordinate adjustments)

── SOCIAL PUBLISHING ─────────────────────────────────────────
Postiz Profile Key:  [masked text input]
Help: "Workspace API key from Postiz dashboard for this event's channels"
```

### 9.3 Topline Messaging Doc Card

Collapsible card in event workspace:
```
TOPLINE MESSAGING DOC                          [Upload PDF ▲]
v2 · 15 Jul 2026 · by Thulasi                   [View ▼]
AI-structured summary ready
```

### 9.4 Stakeholder Hub (`/admin/events/[id]/stakeholders`)

Left nav tabs: Speakers | Sponsors | Exhibitors | Media Partners | Association Partners | Ecosystem Partners

Per tab: count badge, `Pending Review` highlighted count

Card per stakeholder:
```
[photo/logo thumbnail]  FULL NAME                  [Status badge]
                        Job Title · Company
                        Country · Source: Form / Manual

[Edit]  [Upload Photo ▲]  [Upload Logo ▲]  [Generate Announcement ▶]
```

"Generate Announcement ▶" only active when status is `ready` (all assets processed).

Status badges: `Pending Review` (amber) | `Assets Missing` (red) | `Approved` (teal) | `Ready` (lime)

### 9.5 Announcement Generator Slide-over

Opens on "Generate Announcement ▶":

```
─── Generate Announcement: KINSEY LI ──────────────── [✕]

CREATIVE PREVIEW                      [↺ Regenerate creative]
┌────────────────────┐
│  [1080×1350 PNG]   │
│  Sharp composite   │
└────────────────────┘

POST COPY                               [↺ Regenerate copy]
┌───────────────────────────────────────────────────────┐
│  Meet Kinsey Li... [editable textarea]                │
└───────────────────────────────────────────────────────┘
1,243 / 1,300 characters

OPTIONS
Use company logo overlay: [toggle]

── SEND FOR APPROVAL ─────────────────────────────────
Select approvers (all optional):
□ Production Lead      [dropdown: event team members]
□ Commercial Director  [dropdown]
□ Partnerships Lead    [dropdown]
□ Media Lead           [dropdown]
□ Operations Lead      [dropdown]

[Skip approval — go to schedule]   [Send for Approval →]
```

### 9.6 Approval Review Page

`app/admin/events/[id]/announcements/[id]/review/page.tsx`

Accessible via signed URL in approval email (7-day expiry, no EventPilot login required).

Shows: creative image + full post copy + platform list → Approve / Approve with Comments / Request Changes + optional comments → Submit.

### 9.7 Social Calendar

Month grid tab within Stakeholder Hub. Blue dots = speakers, amber = partners. Click → announcement detail. Scheduling suggests next available day with no existing post.

---

## 10. New Files to Create

```
supabase/sae_migration.sql
app/lib/announcements/composite.ts          ← Sharp compositing function
app/admin/events/[id]/stakeholders/page.tsx
app/admin/events/[id]/announcements/[id]/review/page.tsx
app/public/forms/[event_id]/[form_type]/page.tsx
app/api/events/templates/upload/route.ts    ← background PNG upload to R2
app/api/events/templates/route.ts           ← list templates for event
app/api/events/messaging/route.ts
app/api/events/speakers/route.ts
app/api/events/speakers/[id]/route.ts
app/api/events/speakers/[id]/upload-asset/route.ts
app/api/events/speakers/from-submission/route.ts
app/api/events/partners/route.ts
app/api/events/partners/[id]/route.ts
app/api/events/partners/[id]/upload-asset/route.ts
app/api/events/partners/from-submission/route.ts
app/api/public/forms/[event_id]/[form_type]/route.ts
app/api/events/announcements/generate/route.ts
app/api/events/announcements/[id]/route.ts
app/api/events/announcements/[id]/regenerate-copy/route.ts
app/api/events/announcements/[id]/regenerate-creative/route.ts
app/api/events/announcements/[id]/send-for-approval/route.ts
app/api/events/announcements/[id]/approve/route.ts
app/api/events/announcements/[id]/schedule/route.ts
app/api/events/announcements/[id]/publish-now/route.ts
app/api/events/announcements/route.ts
app/api/cron/announcements/sync-status/route.ts
```

**Modify:** `app/admin/events/[id]/page.tsx`

**Delete if created:** `app/api/events/venue-map/route.ts`, `app/api/canva/design/route.ts` autofill action (remove if added — Canva Autofill is not used)

**New npm dependency:** `sharp` — run `npm install sharp` and verify it appears in package.json

---

## 11. Implementation Phases

```
Phase A — Foundation
  A1: Run supabase/sae_migration.sql
  A2: Extend event profile edit form (Section 9.2)
  A3: Add Topline Messaging Doc card
  A4: Add template background upload UI + /api/events/templates/upload

Phase B — Stakeholder Registry
  B1: Speakers + Partners CRUD APIs
  B2: Speaker photo upload + PhotoRoom background removal
  B3: Partner logo upload (accepts PNG, JPG, SVG, PDF, AI)
  B4: Stakeholder Hub page (/admin/events/[id]/stakeholders)
  B5: Public onboarding forms (/public/forms/[event_id]/[form_type])

Phase C — Creative Generation (Sharp)
  C1: Install Sharp, create app/lib/announcements/composite.ts
  C2: Build /api/events/announcements/generate
      (Gemini copy + Sharp composite → R2 → announcement row)
  C3: Test with real WAIS Malaysia background PNG + test speaker record
      Ask Madhu to upload the background PNGs and provide layout coordinates

Phase D — Approval Workflow
  D1: send-for-approval endpoint + Resend emails with signed URLs
  D2: Approval review page (no login required)
  D3: approve endpoint + MM notification

Phase E — Postiz Cloud + Publishing
  E1: /api/events/announcements/[id]/schedule (calls Postiz Cloud)
  E2: /api/events/announcements/[id]/publish-now
  E3: /api/cron/announcements/sync-status (cron-job.org every 15 min)
  E4: Social calendar view

  [MADHU in parallel]:
  - Sign up at platform.postiz.com (Team plan $39/month)
  - Create workspace "World AI Show Malaysia 2026"
  - Connect LinkedIn, X, Instagram, YouTube
  - Generate workspace + global API keys → give to Claude Code

Phase F — End-to-End + Slide-over UI
  F1: Announcement generator slide-over panel (Section 9.5)
  F2: Wire everything together
  F3: Full test with WAIS Malaysia (sandbox — no real publishing until confirmed)
```

---

## 12. What Madhu Does Manually

1. **Export template backgrounds from Canva** — see Section 8 for exact steps
2. **Upload backgrounds to EventPilot** — via the Creative Templates upload in the event profile
3. **Provide layout coordinates** — pixel positions of photo/logo zone and text zones on 1080×1350 canvas
4. **Get PhotoRoom API key** at photoroom.com/api → add to `.env.local` + Railway
5. **Sign up for Postiz Cloud** at platform.postiz.com (Team plan, $39/month)
6. **Connect social accounts + generate API keys** in Postiz → give to Claude Code

---

## 13. Acceptance Criteria

**Phase A–B:** Profile fields save, templates upload to R2, speakers/partners CRUD works, PhotoRoom strips background, logos accept all formats, public form submits, MM notified.

**Phase C:** Sharp composites a 1080×1350 PNG from the background template + speaker photo + text. Output matches visual quality of manually produced creatives. Gemini generates contextual copy from messaging doc.

**Phase D:** Approval email arrives with creative inline and signed link. Approver can action without login. MM notified. Status transitions correctly.

**Phase E:** Postiz schedule call returns post_id. Status → `scheduled`. Sync cron marks `published`. Calendar shows posts.

**Phase F:** Full end-to-end works for one speaker and one partner in sandbox.

---

## 14. Out of Scope

- Canva Autofill API (investigated, not feasible without enterprise developer access)
- Multi-speaker carousel posts
- Session/agenda announcements
- Speaker website card generation
- WhatsApp / TikTok
- Instagram Story format
- Custom font matching in Sharp output (pilot uses system fonts)

---

*EventPilot SAE PRD v1.4 | July 2026 | Trescon Global | Internal Confidential*
