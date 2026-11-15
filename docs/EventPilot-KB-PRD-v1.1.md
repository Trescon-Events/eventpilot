# EventPilot Knowledge Base System
## Product Requirements Document v1.1

**Version:** 1.1 (added Section 13 — Press Intelligence Pipeline)
**Date:** July 2026
**Author:** Madhukar Dudda, Trescon
**Platform:** EventPilot — eventpilot.tresconglobal.com
**Tech stack:** Next.js 16, React 19, Supabase (PostgreSQL), Railway, Gemini 2.0 Flash, Serper, Firecrawl
**Handoff to:** Claude Code
**Classification:** Internal — Trescon Confidential

---

## 0. How to Read This PRD

This PRD is written to be used as the system context for a Claude Code session. Two prompts are provided:
- **Section 12** — First prompt for the core KB build (Phases 1–9)
- **Section 14** — First prompt for the Press Intelligence Pipeline (Phase 10), to be run as a separate Claude Code session after Phases 1–9 are complete

Claude Code should read the actual codebase via the eventpilot MCP connector before writing any code. All new code must follow existing patterns exactly.

---

## 1. Background and Context

### 1.1 What EventPilot Is

EventPilot is Trescon's internal operations platform — a Next.js 16 app (App Router, TypeScript, React 19) deployed on Railway, proxied via Cloudflare to eventpilot.tresconglobal.com. It serves 250+ staff across four offices (Dubai, Bengaluru, Mangalore, Manipal). The platform has 14+ modules including Events, Smart Data, HR Portal, Content Engine, Pilot AI chat, and a Knowledge Base.

### 1.2 Current KB State — What Exists Today

The existing documents system includes:
- PDF upload with Gemini text extraction and auto-classification
- Classification fields: layer, department, min_level, pilot_use, status, ai_reasoning, confidence, flagged
- Approval workflow: pending_manager → pending_depthead → live → rejected
- Admin Knowledge tab in /admin with filter by layer (all / knowledge_base / general / specific / flagged)
- Pilot AI chat that searches the documents table

What is **missing** (what this PRD builds):
- Version control: document_group_id, version, superseded_by, version_note
- source_url field for linking S3/Canva originals without migrating files
- BD Workspace system (access-restricted proposal vault)
- Staff-facing browse page at /knowledge
- S3 upload integration from within EventPilot
- Document ingestion pipeline (drop file → classify → generate .md → store automatically)
- AI generator tools: Proposal Creator, PER Creator, Project Brief Generator
- Press Intelligence Pipeline: automated weekly web scraping → KB update

### 1.3 KB Content Already Built on Disk

The following files exist at /Users/madhu/EventPilot/ and are ready to be seeded into Supabase:

| Folder | Contents | Files |
|---|---|---|
| knowledge-base/corporate/ | Company overview — history, divisions, leadership, geography, strategy | 1 .md |
| knowledge-base/events/managed/ | DFS, DAIF, FSF, DIFC Fintech Week, BBC Vizag, BSS — master .md files | 6 .md |
| knowledge-base/events/signature/ | WAIS (24 editions), HODL/WBS (23), Big CIO Show (7), World CX Summit (8), WCSS (2) | 5 .md |
| knowledge-base/external/ | Trescon press history 2016–2026 | 1 .md |
| knowledge-base/bd/proposals/ | 6 BD proposals: DSO FutureTech, Dubai STEM Summit, DLD LivingSphere, STRIPE Oman, Sharjah Next, World Space Economy Summit | 6 .md |
| knowledge-base/bd/_reference/ | Trescon credentials master, commercial model patterns, proposal structures | 3 .md |
| knowledge-base/seeds/ | seed-kb.mjs — seeds all .md files into Supabase documents table | 1 .mjs |
| knowledge-engine/ | Classifier (1), Processors (4), Generators (3), Ingest script (1) | 8 .md + 1 .mjs |
| Attendee Data Historical/_source/ | 103 cleaned attendee xlsx files — 19 event series, 2017–2025, PII stripped | 103 .xlsx |

---

## 2. Database Migration

### 2.1 Run This First in Supabase SQL Editor

```
File: supabase/kb_migration.sql
```

Safe to run multiple times (IF NOT EXISTS everywhere). It does:

- Relaxes documents.type CHECK to add: event_report, event_brief, proposal, tender, corporate_profile, external_intel, service_portfolio
- Adds to documents: `document_group_id UUID`, `version INTEGER DEFAULT 1`, `version_note TEXT`, `superseded_by UUID → documents(id)`, `source_url TEXT`, `workspace_id UUID → bd_workspaces(id)`
- Creates `bd_workspaces` table: id, name, slug, client_name, client_country, event_name, event_type, status, created_by, created_at, updated_at
- Creates `bd_workspace_members` table: workspace_id, staff_id, role (owner / member / viewer)
- Backfills document_group_id = id for all existing rows
- Creates `documents_live` VIEW: `superseded_by IS NULL AND status = 'live' AND is_active = TRUE`

### 2.2 Then Seed the KB

```bash
node knowledge-base/seeds/seed-kb.mjs --dry-run   # preview first
node knowledge-base/seeds/seed-kb.mjs             # execute
```

---

## 3. Admin KB Panel Upgrades

**Extend the existing Knowledge tab in /admin/page.tsx in place. Do not rebuild it.**

### 3.1 Upload Form — New Fields

| Field | Type | Behaviour |
|---|---|---|
| Source URL | text input | Optional. URL of original file on S3 or Canva. Stored in documents.source_url. Renders as "Download Original" button wherever the document is displayed. |
| Version note | text input | Optional. Describes what changed. Only show when uploading a document that supersedes an existing one. |
| Workspace | select dropdown | Optional. Show only when layer = "specific" AND type = "proposal" or "tender". Lists all bd_workspaces. Stores workspace_id. |

### 3.2 Document List — New UI Elements

- Version badge: show "v[N]" next to title if version > 1
- Superseded indicator: dim rows where superseded_by is set, label "Superseded"
- "Download" button: appears when source_url is set, opens URL in new tab
- "View history" link: appears when document_group_id has multiple versions, opens version history modal

### 3.3 Version History Modal

Opens when "View history" is clicked. Shows all versions of a document group ordered by version DESC. Each row: version number, version_note, created_at, status (live / superseded), "View" button.

### 3.4 Supersede Version Flow

When admin uploads a new version of an existing document:
- Detect existing document with same document_group_id
- Offer confirmation: "This supersedes [title] v[N]"
- On confirm: set superseded_by on old row = new document id; set new document version = old version + 1

### 3.5 BD Workspaces Sub-Tab

New sub-tab inside Knowledge tab. Visible only to admin and super_admin.
- List view: workspace name, client, event name, status, member count, document count
- Create form: name, client_name, client_country, event_name, event_type, status
- Detail panel: list members (add/remove), list documents in workspace with download links

---

## 4. /knowledge — Staff Browse Page

New page at `app/knowledge/page.tsx`. Accessible to all authenticated staff.

### 4.1 Access Control

| min_level value | Who can see |
|---|---|
| all | All authenticated staff |
| team_lead | project_manager, project_director, admin, super_admin |
| management | admin, super_admin only |
| layer = specific with workspace_id | Only staff in bd_workspace_members for that workspace |
| pilot_use = false | NOT shown on staff browse page — AI-reference only |

### 4.2 Page Layout

**Left sidebar — Filters:** Search (debounced 300ms, ilike on title + extracted_text), Layer, Division, Event series, Year, Department

**Main content area — Document cards:** title, type badge, layer badge, year, 200-char excerpt, "Download Original" button if source_url set, click → slide-over with full markdown content

**Top bar:** "Knowledge Base", result count, sort (Most recent / A–Z)

### 4.3 NavBar Integration

Add "Knowledge" nav item in `app/components/NavBar.tsx`. Visible to all authenticated staff.

---

## 5. S3 Upload Integration

### 5.1 API Endpoint

```
POST /api/kb/upload-to-s3
Request: multipart/form-data with file
Response: { url: string, key: string }
```

Validates file type (PDF, PPTX, DOCX, XLSX only), validates size (max 200 MB), generates key `kb-documents/[year]/[slug]-[timestamp].[ext]`, uploads via AWS SDK v3, returns public URL.

**Environment variables (add to Railway):**
```
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
```

---

## 6. Ingestion Pipeline — /api/kb/ingest

```
POST /api/kb/ingest
Request: { file_path, file_name, s3_url, manual_type? }
Response: { document_id, title, summary_preview, output_path }
```

Sequence: Classify → Extract text → Load processor → Gemini generates .md → Write .md → Upsert to Supabase → Return

Admin UI: "Upload & Ingest" button → progress indicator → summary preview → "Publish to KB" confirmation

Reference implementation: `knowledge-engine/scripts/ingest.mjs`

---

## 7. AI Generator Tools

### 7.1 Proposal Creator
- Route: `/admin/tools/proposal-creator` | Access: admin, super_admin, project_director
- Draws from: bd/proposals/, credentials master, commercial models, proposal structures
- Output: downloadable .md + document row in BD vault

### 7.2 Post-Event Report Creator
- Route: `/admin/tools/per-creator` | Access: admin, super_admin, project_director, project_manager
- Draws from: historical PER .md files for the same event series
- Output: structured .md seeded into Supabase, serves as brief for design team

### 7.3 Project Brief Generator Upgrade
- Route: `/admin/events/[id]/brief` — existing page, upgrade it
- Draws from: most recent PER, audience intelligence, company overview, relevant proposal
- Output: intelligence-led brief with KB-derived targets and YoY comparisons

---

## 8. Shared getKBContext() Helper

```typescript
// app/lib/kb-context.ts
export async function getKBContext(params: {
  staffId: string
  taskType: 'proposal' | 'per' | 'brief' | 'sponsorship' | 'chat'
  eventSeries?: string
  eventYear?: number
  staffRole: string
}): Promise<string>
```

Queries documents_live VIEW based on role + task type, returns concatenated context string respecting 100K token limit. Used by all generator tools and Pilot AI chat.

---

## 9. New Files to Create (Phases 1–9)

| File path | Description |
|---|---|
| app/knowledge/page.tsx | Staff-facing KB browse page |
| app/api/kb/upload-to-s3/route.ts | S3 file upload endpoint |
| app/api/kb/ingest/route.ts | Document ingestion pipeline endpoint |
| app/lib/kb-context.ts | Shared getKBContext() helper |
| app/admin/tools/proposal-creator/page.tsx | Proposal Creator UI |
| app/admin/tools/per-creator/page.tsx | PER Creator UI |

**Files to modify:** app/admin/page.tsx, app/components/NavBar.tsx, app/admin/events/[id]/brief/page.tsx, app/api/chat/route.ts

---

## 10. Acceptance Criteria (Phases 1–9)

**Phase 1:** Migration runs clean, seed script works, documents_live VIEW correct
**Phase 2:** source_url field, version badge, version history modal, BD Workspaces sub-tab all working
**Phase 3:** /knowledge loads, search + filters work, role-based access correct, NavBar updated
**Phase 4–5:** S3 upload works, ingest flow classifies + generates + previews + publishes correctly
**Phase 6–9:** getKBContext() works, Pilot AI uses it, all three generators produce quality output

---

## 11. Out of Scope — Phases 1–9

- Bulk PDF migration to S3
- Audience intelligence .md auto-generation from xlsx files
- Sponsorship Deck Builder
- Vector embedding search
- Press Intelligence Pipeline (covered in Section 13 — Phase 10)

---

## 12. First Prompt for Claude Code — Phases 1–9

```
You are building new features for EventPilot — Trescon's internal operations platform.
The codebase is at /Users/madhu/EventPilot. Start by reading the full codebase structure
using the eventpilot MCP connector, then read every file listed below before writing any code.

WHAT YOU ARE BUILDING:
An upgraded Knowledge Base system. The KB already exists (documents table in Supabase,
upload UI in /admin, Pilot AI chat). You are extending it with:
  1. Database migration (supabase/kb_migration.sql — run this first in Supabase)
  2. Seeding the KB (node knowledge-base/seeds/seed-kb.mjs)
  3. Upgrading the admin Knowledge tab (version control, source URL, BD workspaces)
  4. New staff-facing browse page at /knowledge
  5. S3 upload integration (POST /api/kb/upload-to-s3)
  6. Document ingestion pipeline (POST /api/kb/ingest)
  7. Three AI generator tools (Proposal Creator, PER Creator, Project Brief upgrade)
  8. Shared getKBContext() helper at app/lib/kb-context.ts

READ THESE FILES FIRST (in this order):
  1.  knowledge-engine/README.md
  2.  supabase/kb_migration.sql
  3.  knowledge-base/seeds/seed-kb.mjs
  4.  knowledge-engine/classifiers/document-classifier.md
  5.  knowledge-engine/processors/post-event-report.md
  6.  knowledge-engine/processors/proposal.md
  7.  knowledge-engine/generators/proposal-creator.md
  8.  knowledge-engine/generators/per-creator.md
  9.  knowledge-engine/generators/project-brief-creator.md
  10. knowledge-engine/scripts/ingest.mjs
  11. knowledge-base/bd/_reference/credential-blocks/trescon-credentials-master.md
  12. knowledge-base/bd/_reference/commercial-models/commercial-model-patterns.md
  13. EVENTPILOT_PLATFORM_DOCUMENT.md
  14. CLAUDE.md

READ THESE EXISTING CODE FILES:
  - app/admin/page.tsx (the Knowledge tab lives here — extend it, do not rebuild)
  - app/api/documents/upload/route.ts
  - app/api/documents/process/route.ts
  - app/api/documents/list/route.ts
  - app/api/documents/review/route.ts
  - app/chat/page.tsx
  - app/api/chat/route.ts
  - app/lib/supabase.ts

KEY CONSTRAINTS:
  - Follow all existing code patterns exactly: inline styles, no CSS framework,
    Manrope font, dark #080A0B, teal #00A5A3, lime #C0F43C
  - The existing Knowledge tab in /admin must NOT be rebuilt — extend it in place
  - All Supabase writes use supabaseAdmin, reads use supabase (anon key)
  - Use documents_live VIEW for all staff-facing queries
  - Gemini model: gemini-2.0-flash-exp (same as used everywhere else)
  - /knowledge page must match /dashboard visual style
  - Never add a dependency without checking package.json first

IMPLEMENTATION ORDER:
  Phase 1: Run migration SQL + seed script, verify documents appear correctly
  Phase 2: Upgrade admin Knowledge tab
  Phase 3: Build /knowledge staff browse page + NavBar integration
  Phase 4: Build /api/kb/upload-to-s3
  Phase 5: Build /api/kb/ingest + admin UI trigger
  Phase 6: Build getKBContext() helper, upgrade Pilot AI to use it
  Phase 7: Build Proposal Creator at /admin/tools/proposal-creator
  Phase 8: Build PER Creator at /admin/tools/per-creator
  Phase 9: Upgrade /admin/events/[id]/brief to use getKBContext()

START HERE:
  Read all 14 knowledge-engine/knowledge-base files and all 8 existing code files.
  Confirm what you have read and propose the implementation plan for Phase 1 and
  Phase 2 before writing any code.
```

---

## 13. Press Intelligence Pipeline

### 13.1 What This Does — Plain English

Every week, the system wakes up automatically, visits every URL and runs every search query you have configured, finds any new articles or pages mentioning Trescon or its events, reads them, scores their relevance using Gemini, and either publishes them directly to the KB (high confidence) or queues them for Fouzan to review (medium confidence). Once in the KB, every AI tool in EventPilot — Pilot AI chat, Proposal Creator, Project Brief Generator — automatically has access to the latest press coverage, government announcements, and media mentions.

The admin UI lets authorised users add/remove sources, adjust the schedule, monitor runs, review the queue, and see the full history of everything the system has ever found.

### 13.2 Tech Stack for This Feature

- **Serper API** — Google Search API wrapper. Used to run keyword search queries and return matching URLs from across the web. Already have subscription and API key.
- **Firecrawl API** — Web scraping and content extraction. Used to fetch and extract clean text from discovered URLs. Handles JavaScript-rendered pages reliably. Already have subscription and API key.
- **Gemini 2.0 Flash** — Relevance scoring and .md summary generation. Same model used everywhere in EventPilot.
- **Railway Cron** — Triggers the weekly pipeline run automatically via a scheduled HTTP call to an internal endpoint.
- **Supabase** — Three new tables store sources, discovered items, and run logs.

### 13.3 Database Schema

Add this to `supabase/kb_migration.sql` (or a new file `supabase/kb_intel_migration.sql`):

```sql
-- ── Permission flag on staff table ───────────────────────────────────────────
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS kb_intel_manager BOOLEAN DEFAULT FALSE;

-- ── Intelligence sources ──────────────────────────────────────────────────────
-- Each row is one configured source: a search query OR a direct URL to crawl
CREATE TABLE IF NOT EXISTS kb_intel_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  -- 'search_query': run via Serper API
  -- 'direct_url': crawl directly via Firecrawl
  source_type   TEXT NOT NULL CHECK (source_type IN ('search_query', 'direct_url')),
  -- For search_query: { "query": "Trescon site:arabianbusiness.com" }
  -- For direct_url:   { "url": "https://tresconglobal.com/news" }
  config        JSONB NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  last_run_at   TIMESTAMPTZ,
  last_found_count INTEGER DEFAULT 0,   -- how many new items found in last run
  created_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Intelligence items ────────────────────────────────────────────────────────
-- Every URL ever discovered — whether published, queued, or skipped
CREATE TABLE IF NOT EXISTS kb_intel_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         UUID REFERENCES kb_intel_sources(id) ON DELETE SET NULL,
  url               TEXT NOT NULL UNIQUE,     -- deduplication key across all runs
  title             TEXT,
  published_date    TEXT,                     -- from article metadata, string not date
  raw_content       TEXT,                     -- Firecrawl extracted text
  gemini_score      INTEGER,                  -- 0–100 relevance score
  gemini_reasoning  TEXT,                     -- why Gemini scored it this way
  gemini_summary    TEXT,                     -- generated .md summary (if scored ≥ 40)
  event_mentioned   TEXT,                     -- which Trescon event this covers, if any
  article_type      TEXT,                     -- 'press_release' | 'media_coverage' | 'government' | 'other'
  -- 'pending'        → score 40–74, needs Fouzan review
  -- 'approved'       → Fouzan manually approved, published to KB
  -- 'rejected'       → Fouzan rejected, will not appear in KB
  -- 'auto_published' → score ≥ 75, auto-published to KB
  -- 'skipped'        → score < 40, not worth reviewing
  status            TEXT DEFAULT 'pending' CHECK (
                      status IN ('pending','approved','rejected','auto_published','skipped')
                    ),
  reviewed_by       UUID REFERENCES staff(id),
  reviewed_at       TIMESTAMPTZ,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,  -- set when published to KB
  run_id            UUID,                     -- groups items from the same pipeline run
  discovered_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pipeline run log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_intel_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  -- 'running' | 'completed' | 'failed'
  status                TEXT DEFAULT 'running',
  sources_checked       INTEGER DEFAULT 0,
  urls_discovered       INTEGER DEFAULT 0,
  items_auto_published  INTEGER DEFAULT 0,
  items_queued          INTEGER DEFAULT 0,
  items_skipped         INTEGER DEFAULT 0,
  error_message         TEXT,
  -- 'scheduler' = Railway cron | 'manual' = admin clicked Run Now | staff UUID = specific user
  triggered_by          TEXT DEFAULT 'scheduler',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_status   ON kb_intel_items(status);
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_run_id   ON kb_intel_items(run_id);
CREATE INDEX IF NOT EXISTS idx_kb_intel_items_source   ON kb_intel_items(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_intel_runs_status    ON kb_intel_runs(status);

-- ── Schedule configuration ────────────────────────────────────────────────────
-- Stored in a single-row config table so it can be edited from the admin UI
CREATE TABLE IF NOT EXISTS kb_intel_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_schedule   TEXT DEFAULT '0 22 * * 0',  -- Sunday 10pm UTC = Monday 2am Dubai
  is_enabled      BOOLEAN DEFAULT TRUE,
  auto_publish_threshold   INTEGER DEFAULT 75,  -- score ≥ this → auto-publish
  review_threshold         INTEGER DEFAULT 40,  -- score ≥ this → queue for review
  -- score < review_threshold → skip silently
  updated_by      UUID REFERENCES staff(id),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config row
INSERT INTO kb_intel_config (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;
```

### 13.4 Default Sources to Seed

Create a seed script `knowledge-base/seeds/seed-intel-sources.mjs` that inserts these sources into `kb_intel_sources` on first run:

**Search queries (via Serper):**

| Name | Query |
|---|---|
| Arabian Business — Trescon | `Trescon site:arabianbusiness.com` |
| Khaleej Times — Trescon | `Trescon site:khaleejtimes.com` |
| Gulf News — Trescon | `Trescon site:gulfnews.com` |
| Dubai FinTech Summit coverage | `"Dubai FinTech Summit" press release OR coverage` |
| Dubai AI Festival coverage | `"Dubai AI Festival" OR "Dubai AI & Web3 Festival" coverage` |
| World AI Show coverage | `"World AI Show" Trescon` |
| HODL Summit coverage | `"HODL Summit" Trescon` |
| Bengaluru Skill Summit coverage | `"Bengaluru Skill Summit" Trescon` |
| Trescon leadership mentions | `Trescon "Mohammed Saleem" OR "Naveen Bharadwaj"` |
| Trescon awards and recognition | `Trescon award OR recognition 2025 OR 2026` |

**Direct URLs (via Firecrawl):**

| Name | URL |
|---|---|
| Trescon News | `https://tresconglobal.com/news` |
| DIFC Newsroom | `https://difc.ae/newsroom` |
| SPARK Media Centre | `https://www.spark.ae/media-centre` |
| Dubai AI Campus News | `https://www.dubaiai.ae/news` |

### 13.5 API Endpoints

#### POST /api/kb/intel/run
Triggers the full pipeline. Called by Railway cron scheduler weekly, and by admin "Run Now" button.

Protected by internal secret: `Authorization: Bearer ${KB_INTEL_CRON_SECRET}`

**Pipeline sequence:**

```
1. CREATE RUN ROW in kb_intel_runs (status: running)

2. FOR EACH active source in kb_intel_sources:

   If source_type = 'search_query':
     → POST to Serper API: { q: config.query, num: 10 }
     → Get array of { url, title, date, snippet }
     → Filter out URLs already in kb_intel_items (dedup by url)

   If source_type = 'direct_url':
     → POST to Firecrawl /crawl: { url: config.url, limit: 20 }
     → Get array of discovered page URLs
     → Filter out URLs already in kb_intel_items

3. FOR EACH new URL:

   → POST to Firecrawl /scrape: { url, formats: ['markdown'] }
   → Get { markdown, metadata: { title, publishedDate } }

   → Call Gemini with relevance scoring prompt:
     "Score this article 0-100 for relevance to Trescon Global.
      Trescon is a UAE-based event management company that runs events
      including Dubai FinTech Summit, Dubai AI Festival, World AI Show,
      HODL Summit, Big CIO Show, World CX Summit, Bengaluru Skill Summit.
      Return JSON only:
      {
        score: number,
        reasoning: string,
        event_mentioned: string | null,
        article_type: 'press_release' | 'media_coverage' | 'government' | 'other'
      }
      Article title: [title]
      Article content: [first 2000 chars of markdown]"

   → Parse Gemini JSON response

   If score >= auto_publish_threshold (default 75):
     → Call Gemini again with corporate-doc processor guide to generate .md summary
     → Insert into documents table (type: external_intel, layer: knowledge_base,
       status: live, pilot_use: true, source_url: url)
     → Insert into kb_intel_items (status: auto_published, document_id: new doc id)

   If score >= review_threshold (default 40) AND score < auto_publish_threshold:
     → Generate .md summary (store in kb_intel_items.gemini_summary but don't publish yet)
     → Insert into kb_intel_items (status: pending)

   If score < review_threshold:
     → Insert into kb_intel_items (status: skipped, raw_content: null to save space)

4. UPDATE kb_intel_runs row (status: completed, counts)
5. UPDATE kb_intel_sources.last_run_at and last_found_count for each source
6. SEND notification to Fouzan (in-app notification via existing notifications system)
```

#### GET /api/kb/intel/sources
Returns all sources. Used by admin UI.

#### POST /api/kb/intel/sources
Creates a new source. Body: `{ name, source_type, config }`.

#### PATCH /api/kb/intel/sources/[id]
Updates a source (name, config, is_active). Used for edit and pause/resume.

#### DELETE /api/kb/intel/sources/[id]
Deletes a source. Existing items from this source are retained (source_id set to null).

#### GET /api/kb/intel/items
Returns items with filters: `?status=pending&source_id=x&run_id=y&limit=20&offset=0`

#### PATCH /api/kb/intel/items/[id]/approve
Fouzan approves a pending item. System:
- Sets status = 'approved'
- Inserts the gemini_summary into documents table as external_intel
- Sets document_id on the item row
- Sets reviewed_by, reviewed_at

#### PATCH /api/kb/intel/items/[id]/reject
Sets status = 'rejected', reviewed_by, reviewed_at.

#### GET /api/kb/intel/runs
Returns run history with counts. Used by admin dashboard panel.

#### GET /api/kb/intel/config
Returns current config (schedule, thresholds).

#### PATCH /api/kb/intel/config
Updates schedule and thresholds. Body: `{ cron_schedule?, auto_publish_threshold?, review_threshold?, is_enabled? }`

### 13.6 Railway Cron Configuration

In Railway dashboard, add a cron job:

```
Name: KB Intelligence Pipeline
Schedule: 0 22 * * 0   (10pm UTC Sunday = 2am Dubai Monday)
Command: curl -X POST https://eventpilot.tresconglobal.com/api/kb/intel/run \
  -H "Authorization: Bearer $KB_INTEL_CRON_SECRET"
```

The cron schedule stored in `kb_intel_config` is for display in the admin UI. The actual Railway cron must be updated manually when the admin changes the schedule — note this in the admin UI: "Schedule changes take effect after updating the Railway cron job."

Alternatively (better): the `PATCH /api/kb/intel/config` endpoint can call the Railway API to update the cron job automatically if `RAILWAY_API_TOKEN` is available.

### 13.7 New Environment Variables

```
SERPER_API_KEY=           (already have — confirm key name matches existing usage in codebase)
FIRECRAWL_API_KEY=        (already have — confirm key name matches existing usage in codebase)
KB_INTEL_CRON_SECRET=     (new — generate a random string, add to Railway env vars)
```

### 13.8 Admin UI — Intelligence Sub-Tab

New sub-tab inside the Knowledge Base section of `/admin`. Label: "Intelligence". Visible only to staff where `kb_intel_manager = true` OR role = `super_admin`.

**Access setup:** After building this feature, run this SQL in Supabase to give Fouzan access:
```sql
UPDATE staff SET kb_intel_manager = TRUE
WHERE email = '[fouzan''s email address]';
```

The UI has four panels navigated by an internal tab bar:

#### Panel 1 — Dashboard (default view)

Shows the current state of the intelligence pipeline at a glance.

```
Header row:
  "Press Intelligence"                    [Run Now ▶] button

Status row:
  Last run: [date and time]  [status badge: ✓ Completed / ✗ Failed / ⟳ Running]
  Next run: [date and time from cron schedule]

Stats row (three cards):
  [N] Auto-published this run
  [N] Needs review
  [N] Skipped this run

Run History table (last 10 runs):
  Columns: Date | Triggered by | Sources | Found | Published | Queued | Skipped | Status
  Click any row → expands to show items from that run

Schedule & Thresholds section (collapsible):
  Cron schedule display (read-only, with note about Railway)
  Auto-publish threshold: number input (default 75)
  Review threshold: number input (default 40)
  [Save Changes] button
  Pipeline enabled toggle
```

#### Panel 2 — Review Queue

Shows all items with status = 'pending', newest first.

```
Header: "Needs Review ([count])"

For each item — card layout:
  Source name and domain
  Article title (as link to original URL, opens new tab)
  Date discovered / published date if available
  Gemini score badge (colour-coded: green ≥ 75, amber 40–74, red < 40)
  Gemini reasoning (1–2 sentences explaining the score)
  Event mentioned badge (if Gemini identified a specific Trescon event)
  [Preview Summary] button → expands to show full gemini_summary as markdown
  [Add to KB ✓] button → calls approve endpoint, item disappears from queue
  [Reject ✗] button → calls reject endpoint, item disappears from queue

Empty state: "No items awaiting review. The pipeline will queue new items here after the next run."
```

#### Panel 3 — Sources

Shows all configured sources. This is where users add, edit, pause, and remove sources.

```
Header: "Intelligence Sources ([count])"    [+ Add Source] button

Two sections: "Search Queries" and "Direct URLs"

For each source — row layout:
  Active/paused toggle
  Source name
  Query or URL (truncated, full on hover)
  Last run date
  Last found count ("Found 3 last run" or "Never run")
  [Edit] → opens edit modal
  [Delete] → confirmation then delete

Add/Edit Source modal:
  Name: text input (required)
  Type: radio — "Search Query" / "Direct URL"

  If Search Query:
    Query: text input with placeholder
      "e.g. Trescon site:arabianbusiness.com"
    Help text: "This query will be sent to Google Search via Serper.
                Use site: to restrict to specific domains.
                Results are deduplicated automatically — no duplicate articles."

  If Direct URL:
    URL: text input with placeholder
      "e.g. https://tresconglobal.com/news"
    Help text: "This page will be crawled weekly. All linked pages
                found will be checked for Trescon-related content."

  [Cancel] [Save Source]
```

#### Panel 4 — All Items

Full searchable, filterable history of every item ever discovered.

```
Header: "All Items"

Filter bar:
  Search: text input (searches title + url)
  Status: All / Auto-published / Needs review / Approved / Rejected / Skipped
  Source: dropdown of all sources
  Date range: from / to date pickers

Results table:
  Columns: Title | Source | Discovered | Score | Status | Action
  Each row expandable to show gemini_reasoning and gemini_summary
  "View in KB" link for published items (links to the document in /knowledge)
  "View original" link (opens URL in new tab)

Pagination: 20 items per page
```

### 13.9 Permissions Summary

| Action | Who can do it |
|---|---|
| View Intelligence sub-tab | kb_intel_manager = true OR super_admin |
| Add / edit / delete sources | kb_intel_manager = true OR super_admin |
| Adjust schedule and thresholds | kb_intel_manager = true OR super_admin |
| Trigger manual run | kb_intel_manager = true OR super_admin |
| Approve / reject queued items | kb_intel_manager = true OR super_admin |
| View all items history | kb_intel_manager = true OR super_admin |
| Set kb_intel_manager on staff | super_admin only (via existing staff management in /admin) |

### 13.10 New Files to Create (Phase 10)

| File path | Description |
|---|---|
| app/api/kb/intel/run/route.ts | Main pipeline endpoint — Serper → Firecrawl → Gemini → store |
| app/api/kb/intel/sources/route.ts | GET all sources, POST new source |
| app/api/kb/intel/sources/[id]/route.ts | PATCH (edit/pause), DELETE |
| app/api/kb/intel/items/route.ts | GET items with filters |
| app/api/kb/intel/items/[id]/approve/route.ts | Approve pending item → publish to KB |
| app/api/kb/intel/items/[id]/reject/route.ts | Reject pending item |
| app/api/kb/intel/runs/route.ts | GET run history |
| app/api/kb/intel/config/route.ts | GET and PATCH pipeline config |
| knowledge-base/seeds/seed-intel-sources.mjs | Seed default sources into kb_intel_sources |
| supabase/kb_intel_migration.sql | New tables: kb_intel_sources, kb_intel_items, kb_intel_runs, kb_intel_config + staff alteration |

**Files to modify:**
- `app/admin/page.tsx` — add Intelligence sub-tab inside KB section

### 13.11 Acceptance Criteria (Phase 10)

- Migration runs clean — all four new tables created, kb_intel_manager column added to staff
- Default sources seeded correctly (10 search queries, 4 direct URLs)
- "Run Now" triggers pipeline, items appear in All Items panel
- Search queries call Serper correctly and return URLs
- Firecrawl extracts clean text from discovered URLs
- Gemini scores each item and returns valid JSON
- Items with score ≥ 75 auto-publish to documents table and appear in /knowledge
- Items with score 40–74 appear in Review Queue
- Items with score < 40 appear in All Items with status Skipped
- Fouzan can approve a pending item — it publishes to documents and disappears from queue
- Fouzan can reject a pending item — it disappears from queue
- Add Source form works for both search_query and direct_url types
- Edit and pause/resume per source work correctly
- Schedule and threshold config saves correctly
- Run history table shows accurate counts
- Intelligence sub-tab is not visible to standard staff (only kb_intel_manager or super_admin)
- Railway cron secret is validated correctly — unauthenticated calls to /api/kb/intel/run are rejected

---

## 14. First Prompt for Claude Code — Phase 10 (Press Intelligence Pipeline)

**Run this as a separate Claude Code session after Phases 1–9 are complete.**

```
You are adding a new feature to EventPilot called the Press Intelligence Pipeline.
The codebase is at /Users/madhu/EventPilot. Start by reading the codebase structure
using the eventpilot MCP connector, then read the files below before writing any code.

WHAT YOU ARE BUILDING:
An automated weekly pipeline that:
  1. Searches the web (via Serper API) and crawls configured URLs (via Firecrawl)
  2. Finds new articles and pages mentioning Trescon or its events
  3. Scores each item for relevance using Gemini (0–100)
  4. Auto-publishes high-confidence items (score ≥ 75) to the KB documents table
  5. Queues medium-confidence items (score 40–74) for human review
  6. Provides a full admin UI inside the KB admin panel to manage everything

The admin UI has four panels:
  - Dashboard: run status, stats, run history, schedule/threshold settings
  - Review Queue: pending items with approve/reject actions
  - Sources: add/edit/pause/delete search queries and direct URLs
  - All Items: full searchable history of everything ever found

READ THIS PRD SECTION FIRST:
  docs/EventPilot-KB-PRD-v1.1.md — read Section 13 in full before writing any code.
  This contains the complete database schema, API endpoint specs, pipeline logic,
  UI layout, and acceptance criteria for this feature.

READ THESE EXISTING CODE FILES:
  - app/admin/page.tsx (the KB admin panel — you are adding an Intelligence sub-tab)
  - app/api/kb/ingest/route.ts (the existing ingest pipeline — follow same patterns)
  - app/api/kb/intel/ (may already exist from a prior session — check first)
  - app/lib/supabase.ts
  - CLAUDE.md
  - EVENTPILOT_PLATFORM_DOCUMENT.md

KEY CONSTRAINTS:
  - Follow all existing code patterns exactly: inline styles, no CSS framework,
    Manrope font, dark #080A0B, teal #00A5A3, lime #C0F43C
  - All Supabase writes use supabaseAdmin, reads use supabase (anon key)
  - Gemini model: gemini-2.0-flash-exp
  - The Intelligence sub-tab goes inside the existing KB section in app/admin/page.tsx
  - Do not rebuild or restructure the existing admin page — add the sub-tab only
  - API keys: ask me for SERPER_API_KEY, FIRECRAWL_API_KEY, and KB_INTEL_CRON_SECRET
    if they are not already in .env.local
  - Check package.json before adding any new dependency

DATABASE:
  Run supabase/kb_intel_migration.sql in Supabase SQL Editor first.
  Then run: node knowledge-base/seeds/seed-intel-sources.mjs

IMPLEMENTATION ORDER:
  Phase 10a: Run migration + seed default sources, verify tables exist
  Phase 10b: Build all /api/kb/intel/* endpoints (run, sources, items, runs, config)
  Phase 10c: Build the Intelligence sub-tab UI in app/admin/page.tsx
             - Dashboard panel (run status, stats, history, settings)
             - Review Queue panel (approve/reject flow)
             - Sources panel (add/edit/pause/delete)
             - All Items panel (searchable history)
  Phase 10d: Configure Railway cron job (provide instructions for manual setup)
  Phase 10e: Set kb_intel_manager = TRUE for Fouzan (provide the SQL)

START HERE:
  Read docs/EventPilot-KB-PRD-v1.1.md Section 13 in full.
  Read app/admin/page.tsx to understand the existing KB tab structure.
  Confirm what you have read and propose the Phase 10a + 10b implementation
  plan before writing any code.
```

---

*EventPilot Knowledge Base PRD v1.1 | July 2026 | Trescon Global | Internal Confidential*
