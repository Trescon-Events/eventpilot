# EventPilot Knowledge Base — Full System PRD
## v2.0 — KB Document Library + Press Intelligence Pipeline

**Version:** 2.0
**Date:** July 2026
**Author:** Madhukar Dudda, Trescon
**Platform:** EventPilot — eventpilot.tresconglobal.com
**Stack:** Next.js 16 App Router, TypeScript, React 19, Supabase, Cloudflare R2, Railway, Gemini 2.5 Flash, Serper API, Firecrawl API, cron-job.org
**Classification:** Internal — Trescon Confidential

---

## 0. Current Codebase State (Read This First)

Before writing a single line of code, read all files listed in Section 14. Here is what already exists:

### Already Built and Working
- `app/knowledge/page.tsx` — staff-facing KB browse page (reads from `/api/documents/list`, shows cards with type badges, search by title, filter by type, Download + Read modal)
- `app/api/kb/ingest/route.ts` — full ingestion pipeline (classify → extract → Gemini process → R2 upload → save draft)
- `app/api/kb/upload-to-s3/route.ts` — uploads files to Cloudflare R2 (NOT AWS S3 — uses `aws4fetch` compatible signing), returns `r2:kb/uuid/filename` source_url
- `app/api/kb/generators/proposal-creator/route.ts` — proposal generator using KB context
- `app/api/kb/generators/per-creator/route.ts` — PER generator
- `app/api/kb/generators/project-brief/route.ts` — project brief generator
- `app/admin/tools/proposal-creator/page.tsx` — proposal creator UI
- `app/admin/tools/per-creator/page.tsx` — PER creator UI
- `app/lib/kb/classify.ts` — filename-based document classifier
- `app/lib/kb/extract.ts` — text extraction from PDF/PPTX/XLSX
- `app/lib/kb/storage.ts` — R2 storage (putObject, presignGet, deleteObject)
- `app/lib/kb/save-draft.ts` — saves document as pending in Supabase
- `app/lib/kb/access.ts` — shared access control rules
- `app/lib/kb/download-href.ts` — resolves source_url to download link
- `app/lib/kb-context.ts` — getKBContext() helper
- `app/api/documents/list/route.ts` — lists docs for staff or admin
- `app/api/documents/review/route.ts` — approve/reject documents
- `app/api/documents/versions/route.ts` — version history
- `supabase/kb_migration.sql` — adds versioning, source_url, BD workspaces, documents_live VIEW
- `supabase/kb_baseline_columns.sql` — adds layer, department, min_level, etc.

### Storage: Cloudflare R2, NOT AWS S3
The codebase uses R2 with env vars: `KB_R2_ACCOUNT_ID`, `KB_R2_ACCESS_KEY_ID`, `KB_R2_SECRET_ACCESS_KEY`, `KB_R2_BUCKET`. Do NOT add AWS S3 vars — they don't exist and aren't needed.

### Cron Jobs: cron-job.org, NOT Railway Cron
All cron jobs (`app/api/cron/`) are called by cron-job.org with `Authorization: Bearer <CRON_SECRET>`. The press intelligence pipeline MUST follow this same pattern.

### Permission Model: access_roles TEXT[] Array
Staff permissions use `staff_members.access_roles TEXT[]` (not boolean flags, not a single role column). To add KB admin access to Thulasi, add `'kb_admin'` to her `access_roles` array. Check for it with `access_roles && ARRAY['kb_admin']` in SQL or `.includes('kb_admin')` in TypeScript.

### Admin Page Tab Structure
`app/admin/page.tsx` has a tab system with these tabs: `overview | people | intelligence | learning | suggest | events | knowledge | review | security`. The Knowledge tab (`tab === 'knowledge'`) already contains the full KB management UI including: document list, upload form, smart ingest flow, pending docs review, BD Workspaces sub-tab, version history. **Extend this tab — do not rebuild it.**

---

## 1. What This PRD Builds

Two new systems, both as additions to the existing KB infrastructure:

### System A — KB Document Library Upgrades
Adds document categorisation, category-level management, and a `kb_admin` role to the existing KB system. Staff query through Pilot AI chat — the `/knowledge` page remains as-is (no category browsing for staff).

### System B — Press Intelligence Pipeline
An automated weekly pipeline that searches the web and crawls configured URLs for Trescon-related content, scores relevance with Gemini, auto-publishes high-confidence articles to the KB, and queues medium-confidence items for Thulasi's review. Managed via a new "Intelligence" tab in the admin KB section.

---

## 2. Database Migration

Run `supabase/kb_intel_migration.sql` in Supabase SQL Editor. Safe to run multiple times.

```sql
-- ── 1. kb_admin role support ──────────────────────────────────────────────────
-- Uses the existing access_roles TEXT[] array — just add 'kb_admin' to a user's array
-- No schema change needed. Check access with: 'kb_admin' = ANY(access_roles)

-- ── 2. Document category column ───────────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS doc_category TEXT DEFAULT 'uncategorised'
  CHECK (doc_category IN (
    'event_intelligence',
    'business_development',
    'project_management',
    'marketing',
    'company_knowledge',
    'external_owned',
    'external_partner',
    'external_press',
    'uncategorised'
  ));

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(doc_category);

-- ── 3. Press intelligence tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_intel_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  -- 'search_query': run via Serper API (returns URLs from Google)
  -- 'direct_url':   crawl directly via Firecrawl (extracts links from the page)
  -- 'event_registry': special type — extracts structured event list from tresconglobal.com
  source_type     TEXT NOT NULL CHECK (source_type IN ('search_query', 'direct_url', 'event_registry')),
  -- 'owned_property': Trescon's own websites
  -- 'partner_govt':   client / government partner newsrooms
  -- 'press_media':    third-party media (searched via Serper)
  -- 'event_registry': tresconglobal.com event listing (special)
  category        TEXT NOT NULL DEFAULT 'press_media'
    CHECK (category IN ('owned_property', 'partner_govt', 'press_media', 'event_registry')),
  config          JSONB NOT NULL,
  -- For search_query: { "query": "Trescon site:arabianbusiness.com" }
  -- For direct_url:   { "url": "https://difc.ae/newsroom" }
  -- For event_registry: { "url": "https://tresconglobal.com/events" }
  crawl_frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (crawl_frequency IN ('weekly', 'monthly')),
  -- For owned_property URLs: how to handle pages found
  -- 'article_discovery': new pages → scored as articles → added to KB (default)
  -- 'fact_extraction':   page content → updates existing KB doc (e.g. company overview)
  -- 'event_extraction':  structured event list extraction (event_registry only)
  crawl_behaviour TEXT NOT NULL DEFAULT 'article_discovery'
    CHECK (crawl_behaviour IN ('article_discovery', 'fact_extraction', 'event_extraction')),
  is_active       BOOLEAN DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  last_found_count INTEGER DEFAULT 0,
  created_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_intel_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         UUID REFERENCES kb_intel_sources(id) ON DELETE SET NULL,
  url               TEXT NOT NULL UNIQUE,
  title             TEXT,
  published_date    TEXT,
  raw_content       TEXT,
  gemini_score      INTEGER CHECK (gemini_score BETWEEN 0 AND 100),
  gemini_reasoning  TEXT,
  gemini_summary    TEXT,
  event_mentioned   TEXT,
  article_type      TEXT CHECK (article_type IN ('press_release', 'media_coverage', 'government', 'event_website', 'other')),
  -- 'pending':        score 40–74, awaiting Thulasi review
  -- 'approved':       Thulasi approved, published to KB
  -- 'rejected':       Thulasi rejected
  -- 'auto_published': score ≥ 75, auto-published without review
  -- 'skipped':        score < 40, not relevant enough
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'auto_published', 'skipped')),
  reviewed_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  run_id            UUID,
  discovered_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_intel_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  status                TEXT DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  sources_checked       INTEGER DEFAULT 0,
  urls_discovered       INTEGER DEFAULT 0,
  items_auto_published  INTEGER DEFAULT 0,
  items_queued          INTEGER DEFAULT 0,
  items_skipped         INTEGER DEFAULT 0,
  error_message         TEXT,
  -- 'scheduler' = cron-job.org | 'manual' = admin clicked Run Now
  triggered_by          TEXT DEFAULT 'scheduler',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_intel_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cron schedule string (informational — actual cron is on cron-job.org)
  cron_schedule_display     TEXT DEFAULT '0 22 * * 0',
  is_enabled                BOOLEAN DEFAULT TRUE,
  auto_publish_threshold    INTEGER DEFAULT 75,
  review_threshold          INTEGER DEFAULT 40,
  -- Cached event registry data — refreshed weekly from tresconglobal.com
  event_registry_data       JSONB,
  event_registry_source     TEXT DEFAULT 'tresconglobal'
    CHECK (event_registry_source IN ('tresconglobal', 'eventpilot_internal')),
  event_registry_last_updated TIMESTAMPTZ,
  updated_by                UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO kb_intel_config (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

-- ── 4. Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_status   ON kb_intel_items(status);
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_run_id   ON kb_intel_items(run_id);
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_source   ON kb_intel_items(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_intel_runs_status    ON kb_intel_runs(status);
CREATE INDEX IF NOT EXISTS idx_kb_intel_sources_active ON kb_intel_sources(is_active);
```

---

## 3. Seed Default Intel Sources

Create `knowledge-base/seeds/seed-intel-sources.mjs` and run it once after the migration.

Default sources to seed:

**Event Registry (special — run weekly):**
- `tresconglobal.com Events Page` | `event_registry` | `event_registry` | `{ "url": "https://tresconglobal.com/events" }` | weekly | event_extraction

**Owned Properties (monthly):**
- `Trescon News Page` | `direct_url` | `owned_property` | `{ "url": "https://tresconglobal.com/news" }` | monthly | article_discovery
- `Trescon About Page` | `direct_url` | `owned_property` | `{ "url": "https://tresconglobal.com/about" }` | monthly | fact_extraction
- `Trescon Managed Events` | `direct_url` | `owned_property` | `{ "url": "https://tresconglobal.com/managed-events" }` | monthly | fact_extraction
- `Trescon Signature Events` | `direct_url` | `owned_property` | `{ "url": "https://tresconglobal.com/signature-events" }` | monthly | fact_extraction

**Partner & Government (weekly):**
- `DIFC Newsroom` | `direct_url` | `partner_govt` | `{ "url": "https://difc.ae/newsroom" }` | weekly | article_discovery
- `Dubai AI Campus News` | `direct_url` | `partner_govt` | `{ "url": "https://www.dubaiai.ae/news" }` | weekly | article_discovery
- `SPARK Media Centre` | `direct_url` | `partner_govt` | `{ "url": "https://www.spark.ae/media-centre" }` | weekly | article_discovery

**Press & Media — Search Queries (weekly):**
- `Arabian Business — Trescon` | `search_query` | `press_media` | `{ "query": "Trescon site:arabianbusiness.com" }` | weekly | article_discovery
- `Khaleej Times — Trescon` | `search_query` | `press_media` | `{ "query": "Trescon site:khaleejtimes.com" }` | weekly | article_discovery
- `Gulf News — Trescon` | `search_query` | `press_media` | `{ "query": "Trescon site:gulfnews.com" }` | weekly | article_discovery
- `Dubai FinTech Summit Coverage` | `search_query` | `press_media` | `{ "query": "\"Dubai FinTech Summit\" press release OR coverage" }` | weekly | article_discovery
- `Dubai AI Festival Coverage` | `search_query` | `press_media` | `{ "query": "\"Dubai AI Festival\" coverage" }` | weekly | article_discovery
- `World AI Show Coverage` | `search_query` | `press_media` | `{ "query": "\"World AI Show\" Trescon" }` | weekly | article_discovery
- `Trescon Leadership Mentions` | `search_query` | `press_media` | `{ "query": "Trescon \"Mohammed Saleem\" OR \"Naveen Bharadwaj\"" }` | weekly | article_discovery

---

## 4. New Environment Variables

```
# Serper API (Google Search)
SERPER_API_KEY=

# Firecrawl API (web scraping)
FIRECRAWL_API_KEY=

# Cron secret for the intel pipeline endpoint (same pattern as CRON_SECRET)
KB_INTEL_CRON_SECRET=
```

Ask Madhu for the actual values. Check if SERPER_API_KEY and FIRECRAWL_API_KEY already exist in the codebase before asking — search the codebase for existing usage.

---

## 5. New API Endpoints

### POST /api/kb/intel/run
The main pipeline. Called by cron-job.org weekly AND by the admin "Run Now" button.

**Auth:** `Authorization: Bearer <KB_INTEL_CRON_SECRET>`

**Pipeline sequence:**
```
1. Create kb_intel_runs row (status: running)
2. Load kb_intel_config (thresholds, event_registry_data)
3. For each active kb_intel_source:

   If event_registry:
     → Firecrawl scrape the events page
     → Extract structured event list: [{ name, status, website, description }]
     → Update kb_intel_config.event_registry_data with fresh list
     → Update kb_intel_config.event_registry_last_updated
     → Skip scoring — this is config data, not a KB article

   If search_query:
     → POST https://google.serper.dev/search with { q: config.query, num: 10 }
       Headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' }
     → Get array of { link, title, date } from organic results
     → Filter: skip URLs already in kb_intel_items (dedup by url)

   If direct_url:
     → POST https://api.firecrawl.dev/v1/crawl with {
         url: config.url,
         limit: 20,
         scrapeOptions: { formats: ['links'] }
       }
       Headers: { Authorization: 'Bearer ' + FIRECRAWL_API_KEY }
     → Get discovered page URLs
     → Filter: skip URLs already in kb_intel_items

4. For each new URL (all source types except event_registry):
   → POST https://api.firecrawl.dev/v1/scrape with {
       url,
       formats: ['markdown'],
       actions: []
     }
   → Get { markdown, metadata: { title, publishedDate } }

   → Build event context string from kb_intel_config.event_registry_data:
     "Trescon events include: Dubai FinTech Summit, Dubai AI Festival,
      World AI Show, HODL Summit, Big CIO Show, ..."

   → Call Gemini with this prompt:
     "Score this article 0–100 for relevance to Trescon Global Events.
      Trescon is a UAE-based event management company.
      Current Trescon events: [event_registry_data list]
      Return valid JSON only (no markdown, no fences):
      {
        score: number,
        reasoning: string (max 2 sentences),
        event_mentioned: string | null,
        article_type: 'press_release' | 'media_coverage' | 'government' | 'event_website' | 'other'
      }
      Article title: [title]
      Article content (first 2000 chars): [markdown.slice(0, 2000)]"

   → Parse JSON response

   If score >= auto_publish_threshold (default 75):
     → Call Gemini again with corporate-doc processor guide to generate .md summary
     → Insert into documents (type: 'external_intel', layer: 'knowledge_base',
       doc_category: 'external_press', status: 'live', pilot_use: true,
       source_url: url, is_active: true)
     → Insert into kb_intel_items (status: 'auto_published', document_id: new doc id)

   If score >= review_threshold (default 40) and score < auto_publish_threshold:
     → Generate .md summary (stored in gemini_summary, NOT published yet)
     → Insert into kb_intel_items (status: 'pending')

   If score < review_threshold:
     → Insert into kb_intel_items (status: 'skipped', raw_content: null)

5. Update kb_intel_runs (status: completed, counts)
6. Update kb_intel_sources.last_run_at and last_found_count
7. Send in-app notification to all staff with 'kb_admin' in access_roles:
   "Intelligence run complete: N auto-published, M need your review"
```

**Error handling:** If any source fails, log the error, continue with remaining sources. Only mark the run as 'failed' if ALL sources fail.

### GET /api/kb/intel/sources
Returns all sources. Query params: `?category=press_media&active=true`

### POST /api/kb/intel/sources
Creates a new source. Body: `{ name, source_type, category, config, crawl_frequency, crawl_behaviour }`

### PATCH /api/kb/intel/sources/[id]
Updates a source. Body: any subset of `{ name, config, crawl_frequency, crawl_behaviour, is_active }`

### DELETE /api/kb/intel/sources/[id]
Soft deletes (sets is_active: false). Hard delete only if no items reference it.

### GET /api/kb/intel/items
Returns items. Query params: `?status=pending&source_id=x&run_id=y&limit=20&offset=0&search=text`

### POST /api/kb/intel/items/[id]/approve
- Sets status = 'approved', reviewed_by, reviewed_at
- Inserts gemini_summary into documents table (live, external_intel)
- Sets document_id on the item row
- Returns updated item

### POST /api/kb/intel/items/[id]/reject
- Sets status = 'rejected', reviewed_by, reviewed_at

### GET /api/kb/intel/runs
Returns run history, ordered by started_at DESC. Limit: 20.

### GET /api/kb/intel/config
Returns current config row.

### PATCH /api/kb/intel/config
Updates config. Body: `{ cron_schedule_display?, auto_publish_threshold?, review_threshold?, is_enabled?, event_registry_source? }`

---

## 6. KB Admin Panel Changes

**All changes go inside the existing `tab === 'knowledge'` section of `app/admin/page.tsx`.**

### 6.1 Add `doc_category` to Upload Form

Add a "Category" dropdown to the existing document upload form (the `showUploadForm` section):

```
Category (required):
  • Event Intelligence — post-event reports, edition summaries, audience data
  • Business Development — proposals, credentials, commercial models
  • Project Management — project briefs, runsheets, planning docs
  • Marketing — campaign briefs, brand guidelines, messaging frameworks
  • Company Knowledge — overview, stats, credentials, leadership
  • [Auto-detected for ingested docs based on doc type]
```

For the smart ingest flow (`showIngestForm`), auto-map the detected type to a category:
- `post_event_report` → `event_intelligence`
- `proposal` → `business_development`
- `attendee_data` → `event_intelligence`
- `corporate_doc` → `company_knowledge`

### 6.2 Add Category Filter to Document List

Add category filter pills above the existing `docFilter` pills (all / knowledge_base / general / specific / flagged):

```
Category: All | Event Intelligence | Business Development | Project Management | Marketing | Company Knowledge | External
```

### 6.3 Add Intelligence Sub-Tab

Add a third sub-tab to the Knowledge section (alongside the existing "Documents" and "Workspaces" sub-tabs):

```
[Documents] [Workspaces] [Intelligence]
```

The Intelligence sub-tab is only visible when:
```typescript
const isKbAdmin = isSuperAdmin || 
  (staffList.find(s => s.id === adminStaffId)?.access_roles ?? []).includes('kb_admin')
```

### 6.4 Intelligence Sub-Tab — Four Panels

Use an internal tab bar within the Intelligence sub-tab:

```
[Overview] [Review Queue] [Sources] [All Items]
```

#### Panel: Overview

```
Header row:
  "Press Intelligence"     [Run Now ▶] button (calls POST /api/kb/intel/run with KB_INTEL_CRON_SECRET)

Status row:
  Last run: [date and time] [status badge]
  Next run: [from cron_schedule_display in config]
  Pipeline: [Enabled / Disabled toggle — PATCH /api/kb/intel/config { is_enabled }]

Stats cards (3):
  [N auto-published this run] [N needs review] [N skipped this run]
  (from the most recent completed run)

Event Registry section:
  "Event Registry — Powers relevance scoring"
  Source: tresconglobal.com [Change to EventPilot internal] button (super_admin only)
  Last refreshed: [event_registry_last_updated]
  Events found: [count from event_registry_data array]
  Table: Event Name | Website | Status | Add to Sources button
  [Refresh Registry Now] button

Run History table (last 10 runs):
  Date | Triggered by | Sources | Found | Published | Queued | Skipped | Status
  Click any row → expands to show items from that run

Thresholds section (collapsible):
  Auto-publish threshold: [number input, default 75]
    "Articles scoring above this are published automatically"
  Review threshold: [number input, default 40]
    "Articles scoring above this but below auto-publish appear in Review Queue"
  [Save Changes] button → PATCH /api/kb/intel/config
```

#### Panel: Review Queue

```
Header: "Needs Review (N)"

Empty state: "No items awaiting review."

For each pending item, a card:
  [Source name] · [domain] · [discovered date]
  Title (as clickable link to original URL, opens new tab)
  Gemini score badge:
    ≥ 75: green "Score: N"
    40–74: amber "Score: N"
    < 40: red "Score: N"
  event_mentioned badge (if present)
  article_type badge
  Gemini reasoning (1–2 sentences, italic)
  [Preview Summary ▼] toggle — expands gemini_summary rendered as markdown
  [Add to KB ✓] → POST /api/kb/intel/items/[id]/approve
  [Reject ✗] → POST /api/kb/intel/items/[id]/reject

After approve/reject: item disappears from queue, show brief success message
```

#### Panel: Sources

Three collapsible sections:

```
▼ OWNED PROPERTIES ([count] sources) [+ Add Owned Property]
  Each source row:
  [Active toggle] [Name] [URL or query — truncated] [Frequency] [Last found: N] [Edit] [Delete]

▼ PARTNER & GOVERNMENT ([count] sources) [+ Add Partner Source]
  (same row layout)

▼ PRESS & MEDIA ([count] sources) [+ Add Search Query]
  (same row layout)
```

Add Source modal (triggered by any of the three + buttons):
```
Name: [text input]
Type: [pre-filled based on which button was clicked]
  - Owned Property / Partner & Government → direct_url
  - Press & Media → search_query

If search_query:
  Search Query: [text input]
  Placeholder: 'e.g. Trescon site:arabianbusiness.com'
  Help text: 'Google search query. Use site: to restrict to a domain.'

If direct_url:
  URL: [text input]
  Placeholder: 'https://difc.ae/newsroom'
  Crawl Behaviour:
    ● Article Discovery (new pages scored as articles → KB)
    ○ Fact Extraction (page content updates an existing KB document)

Frequency:
  ● Weekly  ○ Monthly

[Cancel] [Save Source]
```

Event Registry section appears at the top of Sources panel with a note:
```
Event Registry (special — not editable)
  tresconglobal.com/events · weekly · event_extraction
  [Switch to EventPilot Internal] — super_admin only
```

#### Panel: All Items

```
Filter bar:
  Search: [text input — searches title + url]
  Status: All | Auto-published | Needs review | Approved | Rejected | Skipped
  Source: [dropdown of all sources]
  Date: [from] to [to]

Results table:
  Title | Source | Discovered | Score | Status | Actions
  Expand row → shows gemini_reasoning + gemini_summary preview
  "View original" → opens URL in new tab
  "View in KB" → shown for published items, links to the document

Pagination: 20 per page
```

---

## 7. KB Admin Access for Thulasi

After building the Intelligence tab, run this SQL in Supabase to grant Thulasi access:

```sql
-- Replace with Thulasi's actual email
UPDATE staff_members
SET access_roles = array_append(
  COALESCE(access_roles, ARRAY['standard']::TEXT[]),
  'kb_admin'
)
WHERE email = '[thulasi email]'
  AND NOT ('kb_admin' = ANY(COALESCE(access_roles, ARRAY[]::TEXT[])));
```

**Thulasi's permissions with `kb_admin` role:**
- View and manage the Intelligence sub-tab (all four panels)
- Add / edit / pause / delete sources
- Run the pipeline manually
- Approve and reject items in the Review Queue (ONLY Thulasi and super_admin can do this)
- Adjust thresholds and schedule
- View all items history

**Important:** The approve/reject buttons must check that the reviewer has `kb_admin` in their `access_roles` OR is `super_admin`. Regular staff and admins without `kb_admin` cannot approve/reject intel items.

---

## 8. Document Category System

### 8.1 The Five Static Categories

| Category key | Display name | Used for | AI tools that use it |
|---|---|---|---|
| `event_intelligence` | Event Intelligence | Post-event reports, audience data, event summaries | Pilot AI, Proposal Creator, Project Brief, PER Creator |
| `business_development` | Business Development | Proposals, credentials, commercial models, BD vault | Pilot AI (role-gated), Proposal Creator |
| `project_management` | Project Management | Project briefs, runsheets, RACI docs | Pilot AI (role-gated), Project Brief Generator |
| `marketing` | Marketing | Campaign briefs, brand docs, messaging frameworks | Pilot AI, future Marketing Brief Generator |
| `company_knowledge` | Company Knowledge | Company overview, stats, divisions, leadership | All AI tools |

### 8.2 The Three Dynamic (Crawled) Categories

| Category key | Display name | Source | How it enters KB |
|---|---|---|---|
| `external_owned` | Owned Properties | tresconglobal.com, event websites | Intel pipeline, crawl_behaviour = fact_extraction or article_discovery |
| `external_partner` | Partner & Government | DIFC, SPARK, govt newsrooms | Intel pipeline, article_discovery |
| `external_press` | Press & Media | Arabian Business, Gulf News, etc. | Intel pipeline, article_discovery or auto-published |

### 8.3 getKBContext() Upgrade

Update `app/lib/kb-context.ts` to support category-based filtering:

```typescript
export interface GetKBContextOptions {
  staffId?: string
  types?: string[]
  categories?: string[]        // NEW — filter by doc_category
  pilotUseOnly?: boolean
  limit?: number
  maxCharsPerDoc?: number
}
```

The existing generator tools should work unchanged. Optionally, each generator can now pass specific categories to narrow context:
- Proposal Creator: `categories: ['business_development', 'event_intelligence', 'company_knowledge']`
- PER Creator: `categories: ['event_intelligence', 'company_knowledge']`
- Project Brief: `categories: ['event_intelligence', 'project_management', 'company_knowledge', 'external_owned']`
- Pilot AI chat: no category filter — use all accessible documents

---

## 9. Cron Setup on cron-job.org

After deployment, set up the weekly cron:

```
URL:     https://eventpilot.tresconglobal.com/api/kb/intel/run
Method:  POST
Schedule: 0 22 * * 0  (Sunday 10pm UTC = Monday 2am Dubai time)
Headers: Authorization: Bearer [KB_INTEL_CRON_SECRET value]
```

The `cron_schedule_display` field in `kb_intel_config` stores this string for display in the admin UI. When an admin changes the display value in the UI, show this notice:
```
"Schedule display updated. To change the actual schedule, update the cron job on cron-job.org."
```

---

## 10. New Files to Create

| File | Description |
|---|---|
| `app/api/kb/intel/run/route.ts` | Main pipeline endpoint |
| `app/api/kb/intel/sources/route.ts` | GET all / POST new source |
| `app/api/kb/intel/sources/[id]/route.ts` | PATCH (edit/pause) / DELETE |
| `app/api/kb/intel/items/route.ts` | GET items with filters |
| `app/api/kb/intel/items/[id]/approve/route.ts` | Approve pending item |
| `app/api/kb/intel/items/[id]/reject/route.ts` | Reject pending item |
| `app/api/kb/intel/runs/route.ts` | GET run history |
| `app/api/kb/intel/config/route.ts` | GET / PATCH pipeline config |
| `knowledge-base/seeds/seed-intel-sources.mjs` | Seed default sources |
| `supabase/kb_intel_migration.sql` | New tables + doc_category column |

**Files to modify:**
| File | What to change |
|---|---|
| `app/admin/page.tsx` | Add Intelligence sub-tab, add category dropdown to upload form, add category filter pills to doc list |
| `app/lib/kb-context.ts` | Add `categories` option to GetKBContextOptions, filter by doc_category |
| `app/lib/kb/classify.ts` | Add `docCategory` to KB_TYPE_META, auto-map on ingest |

---

## 11. Acceptance Criteria

**Migration + Seed:**
- `kb_intel_migration.sql` runs without errors
- `doc_category` column exists on documents table
- All four new intel tables exist
- `seed-intel-sources.mjs` seeds all 14+ default sources correctly

**Document Library:**
- Category dropdown appears in both upload form and smart ingest form
- Category filter pills work in the document list
- Ingested documents auto-get the right category based on their type
- `getKBContext()` accepts and applies `categories` filter

**Intelligence Pipeline:**
- POST `/api/kb/intel/run` with correct Bearer token runs the pipeline
- Serper API is called for `search_query` sources and returns URLs
- Firecrawl scrapes content from discovered URLs
- Gemini scores each article and returns valid JSON
- Articles with score ≥ 75 appear in Supabase documents table as `status: live`
- Articles with score 40–74 appear in `kb_intel_items` as `status: pending`
- Articles with score < 40 appear as `status: skipped`
- `event_registry` source updates `kb_intel_config.event_registry_data`
- Run history is recorded accurately in `kb_intel_runs`

**Intelligence Admin UI:**
- Intelligence sub-tab is NOT visible to standard staff or admin without `kb_admin`
- Intelligence sub-tab IS visible to users with `kb_admin` in access_roles and to super_admin
- All four panels (Overview, Review Queue, Sources, All Items) render correctly
- "Run Now" button triggers the pipeline and shows live status
- Add Source form works for all source types
- Edit / pause / delete per source work
- Thulasi can approve a pending item — it publishes to documents and disappears from queue
- Thulasi can reject a pending item — it disappears from queue
- Threshold changes save and are used on the next run
- Event Registry shows extracted events with "Add to sources" button

**Thulasi Access:**
- SQL to set `kb_admin` for Thulasi runs without errors
- Thulasi can see the Intelligence tab
- Non-kb_admin admin users cannot see the Intelligence tab

---

## 12. Out of Scope

- Audience intelligence `.md` auto-generation from xlsx files
- Sponsorship Deck Builder
- Vector embedding / semantic search
- Public-facing KB
- Automated fact-extraction from owned properties (article discovery mode is sufficient for Phase 1)
- Marketing Brief Generator (future sprint)

---

## 13. Style Reference

All new UI follows existing EventPilot patterns exactly:

```
Background:       #E8EEF4
Surface/card:     #FFFFFF
Border:           #DDE8EE
Text primary:     #0F1923
Text muted:       #5B7080
Teal accent:      #00A5A3 / #00897B / #00695C
Lime accent:      #C0F43C
Font:             Manrope (var(--font-manrope))
Border radius:    16px (cards), 12px (inputs), 8px (badges)
All styles:       inline, no CSS modules, no Tailwind
Font sizes:       13px body, 11px labels/badges, 9px uppercase headers
```

Badge pattern (score colours for intel items):
```
score ≥ 75: color #3D6B00, bg rgba(61,107,0,0.1)
score 40-74: color #92400E, bg rgba(139,26,26,0.1)
score < 40:  color #5B7080, bg #5B708015
```

---

## 14. First Prompt for Claude Code

Copy and paste this entire block into a new Claude Code session:

```
You are adding two new systems to EventPilot — Trescon's internal operations platform.
The codebase is at /Users/madhu/EventPilot.

Start by reading the full codebase structure using the eventpilot MCP connector,
then read every file listed below before writing any code.

WHAT YOU ARE BUILDING:
Two additions to the existing KB system:

System A — Document Category Layer:
  - New doc_category column on documents table
  - Category dropdown in the admin upload form and smart ingest flow
  - Category filter pills in the document list
  - getKBContext() upgraded to support category filtering

System B — Press Intelligence Pipeline:
  - Automated weekly pipeline using Serper + Firecrawl + Gemini
  - Discovers, scores, and publishes/queues web articles about Trescon
  - New "Intelligence" sub-tab in the admin Knowledge section (4 panels)
  - Access controlled by 'kb_admin' in access_roles array

READ THE PRD FIRST:
  docs/EventPilot-KB-PRD-v2.0.md — read ALL sections before writing any code.
  The PRD contains the complete database schema, pipeline logic, UI specs,
  acceptance criteria, and critical notes about the existing codebase.

READ THESE EXISTING FILES:
  - app/admin/page.tsx (LARGE FILE — the entire admin dashboard)
  - app/api/kb/ingest/route.ts
  - app/api/kb/upload-to-s3/route.ts
  - app/lib/kb/classify.ts
  - app/lib/kb/storage.ts
  - app/lib/kb-context.ts
  - app/lib/kb/access.ts
  - app/api/documents/list/route.ts
  - app/api/documents/review/route.ts
  - app/api/cron/hrms-sync/route.ts (for cron auth pattern)
  - app/api/kb/generators/proposal-creator/route.ts
  - supabase/kb_migration.sql
  - supabase/kb_baseline_columns.sql
  - supabase/add_access_roles.sql
  - CLAUDE.md
  - EVENTPILOT_PLATFORM_DOCUMENT.md

CRITICAL NOTES (read the PRD for full detail):
  - Storage is Cloudflare R2 (KB_R2_* env vars), NOT AWS S3
  - Cron jobs use cron-job.org with Authorization: Bearer header,
    NOT Railway cron. The intel pipeline endpoint must follow this pattern.
  - Permissions use access_roles TEXT[] array — add 'kb_admin' to grant access
  - The admin Knowledge tab already has Documents + Workspaces sub-tabs —
    add Intelligence as a third sub-tab, extend in place
  - All styles are inline, no CSS framework, Manrope font, #080A0B dark,
    #00A5A3 teal, #C0F43C lime
  - Gemini model in use: gemini-2.5-flash (check existing routes to confirm)
  - Ask Madhu for: SERPER_API_KEY, FIRECRAWL_API_KEY, KB_INTEL_CRON_SECRET
    if they are not already in .env.local

IMPLEMENTATION ORDER:
  Phase A1: Run supabase/kb_intel_migration.sql
  Phase A2: Run knowledge-base/seeds/seed-intel-sources.mjs (create + run)
  Phase A3: Add doc_category to classify.ts, upload form, ingest flow, doc list
  Phase A4: Upgrade getKBContext() to support categories filter
  Phase B1: Build all /api/kb/intel/* endpoints
  Phase B2: Build Intelligence sub-tab in app/admin/page.tsx (all 4 panels)
  Phase B3: Set up cron on cron-job.org (provide instructions)
  Phase B4: Run SQL to grant Thulasi kb_admin access (provide the SQL)

START HERE:
  Read docs/EventPilot-KB-PRD-v2.0.md in full.
  Read app/admin/page.tsx — specifically find the 'knowledge' tab section
  (search for "tab === 'knowledge'") and understand the current structure.
  Read app/api/cron/hrms-sync/route.ts for the cron auth pattern.
  Then confirm what you have read and propose the Phase A1–A4 plan
  before writing any code.
```

---

*EventPilot KB PRD v2.0 | July 2026 | Trescon Global | Internal Confidential*
