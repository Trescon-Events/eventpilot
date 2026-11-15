# EventPilot Knowledge Base System
## Product Requirements Document v1.0

**Version:** 1.0
**Date:** July 2026
**Author:** Madhukar Dudda, Trescon
**Platform:** EventPilot — eventpilot.tresconglobal.com
**Tech stack:** Next.js 16, React 19, Supabase (PostgreSQL), Railway, Gemini 2.0 Flash
**Handoff to:** Claude Code
**Classification:** Internal — Trescon Confidential

---

## 0. How to Read This PRD

This PRD is written to be used as the system context for a Claude Code session. The first prompt to paste into Claude Code is at the bottom of this file in Section 9.

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

The seed script reads every .md file in knowledge-base/, parses YAML front matter for metadata, and upserts into the documents table. Idempotent — safe to run multiple times.

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

New page at `app/knowledge/page.tsx`. Accessible to all authenticated staff. Separate from the admin panel.

### 4.1 Access Control

| min_level value | Who can see |
|---|---|
| all | All authenticated staff |
| team_lead | project_manager, project_director, admin, super_admin |
| management | admin, super_admin only |
| layer = specific with workspace_id | Only staff in bd_workspace_members for that workspace |
| pilot_use = false | NOT shown on staff browse page — AI-reference only |

### 4.2 Page Layout

**Left sidebar — Filters:**
- Search: text input, debounced 300ms, searches title + extracted_text via ilike
- Layer: All / Company Knowledge / Event Intelligence / External
- Division: All / Managed Events / Signature Events
- Event series: dropdown from available data
- Year: multi-select from years in data
- Department: All / Events / Marketing / Finance / etc.

**Main content area — Document cards:**
- Card shows: title, type badge, layer badge, year, 200-char excerpt of extracted_text
- source_url set → "Download Original" button (opens link in new tab)
- Click card → slide-over panel with full extracted_text rendered as markdown

**Top bar:** page title "Knowledge Base", result count "Showing X of Y documents", sort (Most recent / A–Z)

### 4.3 NavBar Integration

Add "Knowledge" as a nav item in `app/components/NavBar.tsx`. Visible to all authenticated staff. Use book or database icon matching existing nav style.

---

## 5. S3 Upload Integration

### 5.1 API Endpoint

```
POST /api/kb/upload-to-s3
Request: multipart/form-data with file
Response: { url: string, key: string }
```

The endpoint:
- Validates file type: PDF, PPTX, DOCX, XLSX only
- Validates file size: max 200 MB
- Generates key: `kb-documents/[year]/[slug]-[timestamp].[ext]`
- Uploads to existing Trescon S3 bucket via AWS SDK v3
- Returns the public URL

**Environment variables needed (add to Railway):**
```
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
```

### 5.2 Admin UI

"Upload to S3" button next to each document without source_url. Clicking opens file picker → uploads → updates documents.source_url. Also offered as a step in the "create new document" flow.

---

## 6. Ingestion Pipeline — /api/kb/ingest

### 6.1 API Endpoint

```
POST /api/kb/ingest
Request: { file_path: string, file_name: string, s3_url: string, manual_type?: string }
Response: { document_id, title, summary_preview, output_path }
```

**Sequence:**
1. Classify — read knowledge-engine/classifiers/document-classifier.md, apply rules to filename + content signals
2. Extract text — pypdf for PDF, extract-text CLI for PPTX, pandas for XLSX
3. Load processor — read matching .md from knowledge-engine/processors/
4. Generate .md — call Gemini 2.0 Flash with processor guide as system prompt and extracted text as content
5. Write .md — save to correct knowledge-base/ subfolder
6. Upsert — insert .md into documents table with correct metadata
7. Return result

> Reference implementation: `knowledge-engine/scripts/ingest.mjs` — the API endpoint must implement identical logic.

### 6.2 Admin UI — Ingest Flow

"Upload & Ingest" button in the Knowledge tab:
- Admin selects file → uploaded to S3 → ingestion triggered
- Progress indicator: Uploading → Classifying → Extracting → Generating summary → Saving
- On completion: preview of generated summary with "Publish to KB" button
- Admin clicks Publish → document status set to "live" in Supabase

---

## 7. AI Generator Tools

### 7.1 Proposal Creator

- Route: `/admin/tools/proposal-creator`
- Access: admin, super_admin, project_director
- Generator guide: `knowledge-engine/generators/proposal-creator.md`

Multi-step form collecting: client name/type, country, event concept, Trescon role, target scale, themes. Generates a complete proposal using Gemini, drawing from:
- Historical proposals in knowledge-base/bd/proposals/
- trescon-credentials-master.md
- commercial-model-patterns.md
- managed-event-proposal-structure.md

Output: downloadable .md of the full proposal + new document row in BD vault (layer: specific, min_level: team_lead).

### 7.2 Post-Event Report Creator

- Route: `/admin/tools/per-creator`
- Access: admin, super_admin, project_director, project_manager
- Generator guide: `knowledge-engine/generators/per-creator.md`

Structured data entry form for post-event data (attendee count, speakers, themes, sponsors, outcomes, testimonials). Generates a full PER using Gemini, drawing from historical PER .md files for the same event series.

Output: structured .md PER saved to knowledge-base/events/[series]/ and seeded into Supabase. Serves as the brief for the design team to create the visual PDF.

### 7.3 Project Brief Generator Upgrade

- Route: `/admin/events/[id]/brief` — existing page, upgrade it
- Access: admin, super_admin, project_director
- Generator guide: `knowledge-engine/generators/project-brief-creator.md`

Upgrade the existing "Generate Brief" action to use the KB. It must:
- Load the most recent PER for the same event series from Supabase
- Load audience intelligence file for most recent edition
- Load company overview and relevant proposal (if managed event)
- Call Gemini with project-brief-creator.md as system prompt
- Return intelligence-led brief with KB-derived targets (e.g. "2025 had 15,141 registrants — suggest targeting 18,000 for 2026")

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

The function:
- Determines accessible document layers based on staffRole
- Queries documents_live VIEW filtered by layer, department, min_level
- For proposal tasks: includes BD reference files + most relevant historical proposals
- For PER tasks: includes most recent PER .md for the same event series
- For brief tasks: includes PER + audience intelligence + company overview + relevant proposal
- Returns concatenated string of document titles + content (respects 100K token limit — truncates if needed)

Used by: Pilot AI chat (/api/chat/route.ts — upgrade to use this), all three generator tool API routes, all future micro-tools.

---

## 9. New Files to Create

| File path | Description |
|---|---|
| app/knowledge/page.tsx | Staff-facing KB browse page |
| app/api/kb/upload-to-s3/route.ts | S3 file upload endpoint |
| app/api/kb/ingest/route.ts | Document ingestion pipeline endpoint |
| app/lib/kb-context.ts | Shared getKBContext() helper function |
| app/admin/tools/proposal-creator/page.tsx | Proposal Creator AI tool UI |
| app/admin/tools/per-creator/page.tsx | PER Creator AI tool UI |

**Files to modify:**

| File path | What to add |
|---|---|
| app/admin/page.tsx | Knowledge tab: source_url field, version badge, version history modal, BD Workspace sub-tab, Upload & Ingest flow |
| app/components/NavBar.tsx | Add "Knowledge" nav item visible to all staff |
| app/admin/events/[id]/brief/page.tsx | Upgrade "Generate Brief" to use getKBContext() |
| app/api/chat/route.ts | Upgrade Pilot AI to use getKBContext() helper |

---

## 10. Acceptance Criteria

**Phase 1 — Migration + Seed**
- Migration SQL runs without errors
- seed-kb.mjs --dry-run shows all .md files correctly parsed with right metadata
- All files seeded; documents appear in Supabase with correct layer, department, min_level, pilot_use
- documents_live VIEW returns only live, non-superseded documents

**Phase 2 — Admin KB Upgrade**
- Upload form has source_url, version_note, and workspace fields
- Document list shows version badge for v2+ documents
- Superseded documents are dimmed with "Superseded" label
- Documents with source_url show "Download Original" button
- "View history" opens version history modal correctly
- BD Workspaces sub-tab: admin can create workspace, add/remove members, view workspace documents

**Phase 3 — /knowledge Page**
- Page loads for all authenticated staff
- Search, filters, and sort all work correctly
- Role-based access correct — management-only docs hidden from standard staff
- "Knowledge" appears in NavBar for all staff
- "Download Original" button works for documents with source_url

**Phase 4–5 — S3 + Ingest**
- Admin can upload a PDF and it appears in S3 with correct key
- S3 URL stored in documents.source_url
- Upload & Ingest flow: classifies correctly, generates meaningful summary, previews to admin, publishes on confirm

**Phase 6–9 — Generators**
- getKBContext() returns correct documents based on role and task type
- Pilot AI chat uses getKBContext() and respects role-based access
- Proposal Creator generates complete structured proposal using KB references
- PER Creator generates complete PER matching historical series style
- Project Brief includes KB-derived intelligence (actual stats, YoY comparisons, sector targets)

---

## 11. Out of Scope — This Sprint

- Bulk PDF migration to S3 (done manually when S3 integration is live)
- Audience intelligence .md auto-generation from xlsx files (future sprint)
- Sponsorship Deck Builder (future sprint)
- Vector embedding search (ilike is sufficient for current volume)
- Public-facing KB (internal only)
- Automated refresh of external intelligence documents

---

## 12. First Prompt for Claude Code

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

*EventPilot Knowledge Base PRD v1.0 | July 2026 | Trescon Global | Internal Confidential*
