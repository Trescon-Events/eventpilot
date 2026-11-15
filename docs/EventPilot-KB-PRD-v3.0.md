# EventPilot Knowledge Base — Self-Learning Extraction Pipeline
## Product Requirements Document v3.0

**Version:** 3.0
**Date:** July 2026
**Author:** Madhukar Dudda, Trescon
**Feature name:** KB Self-Learning Extraction (Gap Detection + Processor Evolution)
**Builds on:** PRD v2.0 (KB Document Library + Press Intelligence Pipeline)
**Classification:** Internal — Trescon Confidential

---

## 0. Current State — What Already Exists

Read the codebase thoroughly before implementing. Key files:

| File | What it does |
|---|---|
| `app/api/kb/ingest/route.ts` | Full ingest pipeline: classify → extract → Gemini process → R2 upload → save draft |
| `app/lib/kb/classify.ts` | Classifies files into 4 types: `post_event_report`, `proposal`, `attendee_data`, `corporate_doc` |
| `app/lib/kb/extract.ts` | Extracts text from PDF (via Gemini File API), XLSX (via SheetJS), TXT/MD |
| `app/lib/kb/save-draft.ts` | Inserts document as `status: pending` awaiting admin publish |
| `app/lib/kb/storage.ts` | Cloudflare R2 via aws4fetch — `putObject`, `presignGet`, `deleteObject` |
| `app/lib/kb-context.ts` | `getKBContext()` — fetches docs for AI tools with category fallback |
| `app/lib/kb/access.ts` | Shared access control rules |
| `knowledge-engine/processors/post-event-report.md` | Extraction guide for PERs |
| `knowledge-engine/processors/proposal.md` | Extraction guide for proposals |
| `knowledge-engine/processors/attendee-data.md` | Extraction guide for XLSX attendee files |
| `knowledge-engine/processors/corporate-doc.md` | Extraction guide for company docs |
| `app/admin/page.tsx` | Admin dashboard with `tab === 'knowledge'` section containing `docSubTab` (documents / workspaces / intelligence) and `intelSubTab` (overview / review / sources / items) |
| `app/admin/tools/proposal-creator/page.tsx` | Proposal Creator UI |
| `app/admin/tools/per-creator/page.tsx` | PER Creator UI |
| `app/knowledge/page.tsx` | Staff-facing KB browse page |
| `supabase/kb_migration.sql` | Version control, source_url, BD workspaces, documents_live VIEW |
| `supabase/kb_intel_migration.sql` | doc_category, kb_intel_sources/items/runs/config tables |

**Current ingest flow (one Gemini call):**
```
Upload file → classify type → extract text → load processor guide
→ Gemini generates .md summary → save to R2 → save as pending draft
→ Admin reviews summary → publishes or rejects
```

**This PRD adds:** A second Gemini call (gap detection) after the first, followed by a structured conversation with the uploader before they publish.

---

## 1. What This Feature Builds

A self-learning extraction system that:

1. **Detects gaps** — After generating the standard extraction, a second Gemini call compares what was found in the document against what the current processor guide knows to capture. It flags anything new.

2. **Converses with the uploader** — Using a structured question UI (Lovable-style constrained choices, not free chat), the uploader classifies each gap, decides whether to capture it permanently, and names the new field.

3. **Updates the processor** — Confirmed new fields are written back to the processor `.md` file and logged in a field registry table. The next upload of the same document type automatically captures these fields.

4. **Works across all document types** — `post_event_report`, `proposal`, `attendee_data`, `corporate_doc`, and any future types added to `classify.ts`.

---

## 2. Database Migration

Add to a new file `supabase/kb_selflearn_migration.sql`:

```sql
-- ── Field Registry ────────────────────────────────────────────────────────────
-- Every field ever confirmed by an uploader across all processor types
CREATE TABLE IF NOT EXISTS kb_field_registry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_type    TEXT NOT NULL,   -- matches KbDocType: 'post_event_report' | 'proposal' | 'attendee_data' | 'corporate_doc'
  field_name        TEXT NOT NULL,   -- the canonical field name (e.g. 'design_concept_name')
  field_description TEXT NOT NULL,   -- what this field captures, in plain English
  field_category    TEXT,            -- which section of the processor it belongs to (e.g. 'Content', 'Client', 'Commercial Model')
  example_value     TEXT,            -- the example from the document that triggered this addition
  is_required       BOOLEAN DEFAULT FALSE,   -- false = optional (capture when present), true = always extract
  added_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  triggered_by_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  added_at          TIMESTAMPTZ DEFAULT NOW(),
  is_active         BOOLEAN DEFAULT TRUE,
  UNIQUE(processor_type, field_name)
);

-- ── Processor Changelog ───────────────────────────────────────────────────────
-- Every change ever made to any processor file — full audit trail
CREATE TABLE IF NOT EXISTS kb_processor_changelog (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_type TEXT NOT NULL,
  change_type    TEXT NOT NULL CHECK (change_type IN ('field_added', 'field_removed', 'field_modified')),
  field_name     TEXT NOT NULL,
  previous_value TEXT,
  new_value      TEXT,
  changed_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  document_id    UUID REFERENCES documents(id) ON DELETE SET NULL,
  changed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Gap Review Queue ──────────────────────────────────────────────────────────
-- Tracks gaps flagged for a specific ingest session that haven't been resolved yet.
-- Cleared when uploader completes the gap conversation (publish or skip all).
CREATE TABLE IF NOT EXISTS kb_gap_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES documents(id) ON DELETE CASCADE,
  processor_type  TEXT NOT NULL,
  gaps            JSONB NOT NULL,   -- array of gap objects from Gemini (see Section 4)
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_field_registry_type    ON kb_field_registry(processor_type);
CREATE INDEX IF NOT EXISTS idx_kb_gap_sessions_doc       ON kb_gap_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_gap_sessions_resolved  ON kb_gap_sessions(resolved);
```

---

## 3. Changes to the Ingest Route

**File:** `app/api/kb/ingest/route.ts`

After the existing Gemini summary call, add a second call — gap detection. The gap detection result is stored but does NOT block the ingest from completing. The summary still gets saved as a pending draft immediately. The gap conversation happens in the admin UI, before the admin clicks Publish.

### Add to the ingest route — after `saveDraftDocument`:

```typescript
// ── Gap detection ──────────────────────────────────────────────────────────────
// Second Gemini call: compare document content against the current processor
// guide to find information types the processor doesn't know to capture.
let gaps: Gap[] = []
try {
  gaps = await detectGaps(model, processorGuide, extractedText, file.name, docType)
} catch (e) {
  // Gap detection is best-effort — never fail the ingest because of it
  console.warn('kb gap detection failed:', e)
}

// If gaps found, store a gap session for the admin to resolve before publishing
if (gaps.length > 0 && doc?.id) {
  await supabaseAdmin.from('kb_gap_sessions').insert({
    document_id: doc.id,
    processor_type: docType,
    gaps: gaps,
    resolved: false,
  })
}

return NextResponse.json({
  success: true,
  detected_type: docType,
  document: doc,
  summary,
  gaps,              // returned to the UI so it can show the gap conversation immediately
  gap_count: gaps.length,
})
```

### The `detectGaps` function (add to ingest route or a new `app/lib/kb/gaps.ts`):

```typescript
export interface Gap {
  id: string                    // random UUID, used as React key
  description: string           // "I found X in this document"
  location: string              // "Page 6" or "Column header" or "Section 3"
  example_value: string         // the actual value from the document
  suggested_field_name: string  // Gemini's suggested canonical field name
  suggested_category: string    // which section of the processor it belongs to
  suggested_options: string[]   // 3-4 Gemini-suggested classification options for the uploader
  confidence: 'high' | 'medium' | 'low'
}

async function detectGaps(
  model: GenerativeModel,
  processorGuide: string,
  extractedText: string,
  filename: string,
  docType: string
): Promise<Gap[]> {
  const prompt = `You are reviewing a document that has just been processed for Trescon's Knowledge Base.

The current processor guide lists the fields we know how to extract:
${processorGuide}

The document content is:
${extractedText.slice(0, 30000)}

Filename: ${filename}
Document type: ${docType}

Your task: Compare what you found in this document against the fields listed in the processor guide.
Find information types that ARE in this document but are NOT covered by the processor guide.

Rules:
- Only flag genuinely new field types, not just different values of existing fields
- Minor variations of existing fields do NOT count as gaps
- Ignore formatting, styling, or layout elements — only substantive information
- Maximum 5 gaps per document — only flag the most significant ones
- If there are no gaps, return an empty array

Return a JSON array only (no markdown, no explanation):
[
  {
    "id": "uuid-string",
    "description": "Brief description of what I found (start with 'I found:')",
    "location": "Where in the document (e.g. 'Page 6', 'Column J', 'Section: Commercial Model')",
    "example_value": "The actual value from the document",
    "suggested_field_name": "snake_case_field_name",
    "suggested_category": "Which section this belongs to",
    "suggested_options": ["Option A", "Option B", "Option C", "Something else"],
    "confidence": "high|medium|low"
  }
]

If no gaps found, return: []`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  
  const parsed = JSON.parse(text.startsWith('[') ? text : '[]')
  return Array.isArray(parsed) ? parsed.slice(0, 5) : []
}
```

---

## 4. New API Endpoints

### POST /api/kb/gaps/resolve
Called when the uploader completes the gap conversation (for one or all gaps).

**Request body:**
```typescript
{
  session_id: string
  document_id: string
  admin_staff_id: string
  resolutions: {
    gap_id: string
    action: 'add_to_processor' | 'skip' | 'pending'
    field_name?: string           // chosen by uploader in step 3
    field_description?: string    // chosen/typed in step 1
    field_category?: string       // inferred from step 1
    is_required?: boolean         // from step 2: 'only when present' = false, 'always' = true
    example_value?: string        // from the original gap
  }[]
}
```

**What it does:**
1. For each resolution where `action === 'add_to_processor'`:
   - Inserts into `kb_field_registry`
   - Calls `updateProcessorFile()` to add the field to the processor `.md`
   - Inserts into `kb_processor_changelog`
2. For each resolution where `action === 'pending'`:
   - Leaves gap in `kb_gap_sessions` with `resolved: false`
   - Thulasi can review pending gaps later in the KB admin
3. Marks the session as `resolved: true` when all gaps are actioned
4. Returns `{ success: true, fields_added: N }`

### GET /api/kb/gaps?document_id=X
Returns the gap session for a specific document. Used by the admin UI to check if a document has unresolved gaps.

### PATCH /api/kb/processor/[type]
Updates a processor `.md` file with new field information. Called by `resolve` endpoint internally.

**This endpoint reads the current processor file, inserts the new field in the correct section, and writes it back.**

---

## 5. The Processor Update Logic

**New file: `app/lib/kb/update-processor.ts`**

```typescript
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface NewField {
  field_name: string
  field_description: string
  field_category: string
  example_value: string
  is_required: boolean
}

export function updateProcessorFile(processorType: string, newField: NewField): void {
  const processorName = {
    post_event_report: 'post-event-report.md',
    proposal: 'proposal.md',
    attendee_data: 'attendee-data.md',
    corporate_doc: 'corporate-doc.md',
  }[processorType]

  if (!processorName) throw new Error(`Unknown processor type: ${processorType}`)

  const path = join(process.cwd(), 'knowledge-engine', 'processors', processorName)
  const current = readFileSync(path, 'utf-8')

  // Find the right section to insert the new field
  // Look for the section heading that matches field_category
  const sectionHeading = `### ${newField.field_category}`
  const insertAfterIdx = current.indexOf(sectionHeading)

  const fieldEntry = `\n- **${newField.field_name.replace(/_/g, ' ')}** (${newField.is_required ? 'required' : 'optional'})\n  - Description: ${newField.field_description}\n  - Example: \`${newField.example_value}\`\n  - Field name: \`${newField.field_name}\`\n  - *Added: ${new Date().toISOString().slice(0, 10)}*`

  let updated: string
  if (insertAfterIdx !== -1) {
    // Find end of section heading line and insert after it
    const afterHeading = current.indexOf('\n', insertAfterIdx) + 1
    updated = current.slice(0, afterHeading) + fieldEntry + '\n' + current.slice(afterHeading)
  } else {
    // Section not found — append to end of file under a new section
    updated = current + `\n\n${sectionHeading}\n${fieldEntry}\n`
  }

  writeFileSync(path, updated, 'utf-8')
}
```

---

## 6. The Gap Conversation UI

This is the most important part. It lives in the admin Knowledge tab, in the existing ingest/upload flow.

### Where it appears

After the admin uploads a file and the ingest pipeline returns:
- If `gap_count === 0`: show the existing "Review & Publish" step immediately (no change)
- If `gap_count > 0`: show the gap conversation BEFORE the "Publish to KB" button

The gap conversation replaces the direct "Publish" button with a "Resolve gaps before publishing" state.

### The conversation component

**New component: `KBGapConversation`**

State:
```typescript
const [currentGapIndex, setCurrentGapIndex] = useState(0)
const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
const [resolutions, setResolutions] = useState<Resolution[]>([])
```

Layout: Full-width card, sits between "Generated Summary" preview and the "Publish" button.

```
┌─────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐   │
│  │  BEFORE YOU PUBLISH                              │   │
│  │  I found 2 pieces of new information in this    │   │
│  │  document that I haven't seen before. Help me   │   │
│  │  understand them so I can learn from this.      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  GAP 1 OF 2  ●○○                                       │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  I found:                                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ "Frameworks of the Future: Shaping Tomorrow"      │  │
│  │ Location: Page 6                                  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  STEP 1 OF 3 — What type of information is this?       │
│                                                         │
│  [radio button options — see below]                     │
│                                                         │
│  [← Back]  [Next →]  [Skip this gap ›]                 │
└─────────────────────────────────────────────────────────┘
```

### Step 1 — Classification (radio select, pick one)

Options are generated by Gemini's `suggested_options` array plus a "Something else" free text option.

Example for a proposal gap:
```
What type of information is this?

○ The event's visual / design identity
○ A sub-theme or content track
○ A tagline or positioning line
○ A creative campaign name
○ Something else — let me describe it [________________]
```

Example for a XLSX attendee data gap:
```
What does this column contain?

○ A registration source / channel (how they heard about the event)
○ A ticket tier or pass type
○ A payment method
○ A dietary or accessibility requirement
○ Something else — let me describe it [________________]
```

Example for a PER gap:
```
What type of metric or section is this?

○ A sustainability / carbon offset metric
○ A digital / hybrid attendance stat
○ A startup competition outcome
○ A new sponsor tier type
○ Something else — let me describe it [________________]
```

**Validation:** Must select or type something before Next is enabled.

### Step 2 — Importance (radio select, pick one)

```
Should I capture this for all future [proposals / post-event reports / etc.]?

○ Yes — always look for this and extract it
○ Only when present — it's optional, not every document will have one
○ No — this was specific to this document, don't capture it again
```

If "No" is selected → skip to end of this gap, record as `action: 'skip'`, move to next gap.
If "Yes" or "Only when present" → proceed to Step 3.

### Step 3 — Naming (radio + free text)

```
What should I call this field in the knowledge base?

○ [Gemini suggestion 1]
○ [Gemini suggestion 2]
○ [Gemini suggestion 3]
○ Use my own label: [_______________________]
```

Gemini's `suggested_field_name` pre-populates one of the options (converted to human-readable format). The other options are variations.

**On "Done" / completing step 3:** Record resolution, auto-advance to next gap.

### After all gaps resolved — summary screen

```
┌─────────────────────────────────────────────────────────┐
│  All gaps resolved.                                     │
│                                                         │
│  WHAT I LEARNED FROM THIS DOCUMENT                      │
│                                                         │
│  Added to [proposal] processor:                         │
│  ✓ Design concept name (optional)                       │
│                                                         │
│  Skipped:                                               │
│  ✗ Joint bid partner — marked as one-off                │
│                                                         │
│  These new fields will be captured automatically        │
│  in all future [proposal] uploads.                      │
│                                                         │
│  [Publish to Knowledge Base →]                          │
└─────────────────────────────────────────────────────────┘
```

The "Publish to Knowledge Base" button calls the existing `PATCH /api/documents/review` endpoint with `action: 'approve'`. Before doing so, it calls `POST /api/kb/gaps/resolve` with all resolutions.

### The "Skip this gap" option

Available at any step. Records `action: 'pending'` — the gap is not actioned now but saved for Thulasi to review later in the KB admin panel. This prevents the uploader being blocked.

### "I'm not sure" path

The middle option on Step 2 ("Only when present") combined with "Skip this gap" gives uploaders two escape valves. They are never truly stuck.

---

## 7. Admin KB Panel — Gap Review (Thulasi's view)

Add a fourth sub-tab to `docSubTab`: `'gaps'` — visible only to `kb_admin` and `super_admin`.

**Tab label:** "Pending Gaps ([count of unresolved kb_gap_sessions])"

### Gap Review panel layout

```
Pending Gaps from Recent Uploads (N)

For each unresolved gap session:
  Document: [title] — uploaded [date]
  Processor type: [proposal / post_event_report / etc.]
  
  GAP 1:
  Found: "[example_value]" (Location: [location])
  Description: [description]
  
  What type is this? [same 3-step flow as above]
  
  [Resolve ✓]  [Dismiss ✗]
```

This is the same conversation UI as during upload, but triggered later by Thulasi for gaps that were skipped during upload.

---

## 8. How It Works Per Document Type

### post_event_report
Gap detection looks for:
- New metric types (e.g. "Carbon offset achieved" — sustainability reporting)
- New digital/hybrid attendance stats
- New session format types
- New award or competition categories
- New sponsor tier naming conventions
- New government participation structures

### proposal
Gap detection looks for:
- New commercial model variants
- New event format types
- New client types
- Named visual/design concepts (like "Frameworks of the Future")
- New geographic framing concepts (like "South-South corridor")
- Joint bid partners

### attendee_data (XLSX)
Gap detection works differently — it looks for unmapped column names, not conceptual gaps.

Special logic in `detectGaps` for `attendee_data`:
- Compares XLSX column headers against the column mapping in `attendee-data.md`
- Any column not in the mapping = a gap
- Step 1 question: "What does column '[column name]' contain?"
- Step 3: "What should I map this column to?" (standard field name)
- Result: new column mapping added to `attendee-data.md`

### corporate_doc
Gap detection looks for:
- New document sub-types (e.g. "government endorsement letter")
- New structured information types in company docs

---

## 9. New Files to Create

| File | Description |
|---|---|
| `app/lib/kb/gaps.ts` | `detectGaps()` function, `Gap` type, `updateProcessorFile()` |
| `app/lib/kb/update-processor.ts` | Processor `.md` file updater |
| `app/api/kb/gaps/resolve/route.ts` | POST — resolve gap resolutions, update processor |
| `app/api/kb/gaps/route.ts` | GET — fetch gap session for a document |
| `supabase/kb_selflearn_migration.sql` | New tables: kb_field_registry, kb_processor_changelog, kb_gap_sessions |

**Files to modify:**

| File | What to add |
|---|---|
| `app/api/kb/ingest/route.ts` | Add second Gemini call (gap detection) after summary; save gap session; return gaps in response |
| `app/admin/page.tsx` | Add gap conversation UI in the ingest flow; add "Pending Gaps" sub-tab in Knowledge tab |

---

## 10. Style Guide for Gap Conversation UI

Follows existing EventPilot patterns exactly:

```
Background:          #E8EEF4
Card surface:        #FFFFFF
Border:              #DDE8EE
Text primary:        #0F1923
Text muted:          #5B7080
Teal accent:         #00A5A3
Progress dots:       filled = #00A5A3, empty = #DDE8EE, size 8px
Gap counter:         "GAP N OF M" — 11px, weight 800, #5B7080, letter-spacing 1.5px
Step counter:        "STEP N OF 3" — 11px, weight 800, #00695C, uppercase
Found box:           background #F0FAFA, border #00A5A315, border-radius 10px, 12px padding
Radio option:        border 1px #DDE8EE, selected: border #00A5A3, bg #00A5A308
Free text input:     same as existing INPUT style in proposal-creator
Skip link:           "Skip this gap ›" — 13px, color #5B7080, no background, right-aligned
Back/Next buttons:   match existing tbtn styles in admin page
Summary screen:      ✓ items = color #3D6B00, ✗ items = color #5B7080
```

---

## 11. Acceptance Criteria

**Gap Detection:**
- [ ] After ingest, a second Gemini call runs gap detection
- [ ] Returns 0–5 gaps in structured JSON
- [ ] If 0 gaps: ingest flow unchanged — direct to Publish
- [ ] If 1+ gaps: gap conversation shown before Publish button
- [ ] Gap session saved to `kb_gap_sessions` table
- [ ] Gap detection failure does NOT block ingest (try/catch, warn only)

**Gap Conversation UI:**
- [ ] Shows "GAP N OF M" counter correctly
- [ ] Shows progress dots (●○○ for step 1, ●●○ for step 2, ●●● for step 3)
- [ ] Step 1 radio options are generated from `suggested_options` + "Something else" free text
- [ ] "Something else" free text is enabled and functional
- [ ] Step 2 three-way choice works ("always" / "only when present" / "no")
- [ ] Selecting "No" at step 2 skips step 3 and moves to next gap immediately
- [ ] Step 3 shows 3-4 naming options plus free text
- [ ] "Skip this gap" is available at all steps and records `action: 'pending'`
- [ ] Back navigation between steps works
- [ ] Summary screen shows correct ✓/✗ breakdown
- [ ] "Publish to Knowledge Base" button only appears after all gaps are actioned

**Processor Update:**
- [ ] Confirmed fields are written to `kb_field_registry`
- [ ] Processor `.md` file is updated with new field under correct section
- [ ] Change logged in `kb_processor_changelog`
- [ ] Next ingest of same type now captures the new field (manual verification)

**Attendee XLSX special case:**
- [ ] For XLSX files, gap detection compares column headers against `attendee-data.md` mapping
- [ ] Unmapped columns are flagged as gaps
- [ ] Resolved columns are added to the column mapping in `attendee-data.md`

**Admin Gap Review (Thulasi):**
- [ ] "Pending Gaps" sub-tab shows count of unresolved sessions
- [ ] Thulasi can action pending gaps using same 3-step UI
- [ ] Resolved gaps disappear from the pending count

**Audit trail:**
- [ ] `kb_processor_changelog` has a row for every field added
- [ ] `kb_gap_sessions.resolved = true` when all gaps for a document are actioned

---

## 12. What NOT to Build in This Sprint

- Cross-type learning (gap confirmed in proposals suggesting same field for PERs — future)
- Automatic field removal from processors (humans only, never automated)
- Gap detection for press/web articles from the intelligence pipeline (different flow)
- A dedicated "Processor Health" dashboard (future)
- Field validation or type-checking on extracted values (future)

---

## 13. First Prompt for Claude Code

```
You are adding a self-learning extraction feature to EventPilot's Knowledge Base system.
The codebase is at /Users/madhu/EventPilot. Read the codebase using the eventpilot 
MCP connector, then read every file listed below before writing any code.

WHAT YOU ARE BUILDING:
A self-learning gap detection and processor evolution system. When a file is uploaded 
to the KB, a second Gemini call detects information in the document not covered by 
the current processor guide. The uploader answers structured questions (radio buttons 
+ optional free text — NOT open chat) to classify each gap. Confirmed new fields are 
written back to the processor .md file so the next upload captures them automatically.

READ THE PRD FIRST:
  docs/EventPilot-KB-PRD-v3.0.md — read ALL sections before writing any code.

READ THESE EXISTING FILES:
  - app/api/kb/ingest/route.ts              (you will add gap detection here)
  - app/lib/kb/classify.ts                  (KbDocType and KB_TYPE_META)
  - app/lib/kb/extract.ts                   (text extraction — reference only)
  - app/lib/kb/save-draft.ts                (saveDraftDocument — reference only)
  - app/lib/kb/storage.ts                   (R2 storage — reference only)
  - knowledge-engine/processors/proposal.md          (current proposal processor)
  - knowledge-engine/processors/post-event-report.md (current PER processor)
  - knowledge-engine/processors/attendee-data.md     (current XLSX processor)
  - knowledge-engine/processors/corporate-doc.md     (current corporate processor)
  - app/admin/page.tsx (LARGE — search for 'docSubTab' and 'showIngestForm' 
    to find where the gap conversation UI will be added)
  - CLAUDE.md
  - EVENTPILOT_PLATFORM_DOCUMENT.md

KEY CONSTRAINTS:
  - All styles are inline, no CSS framework, Manrope font, #080A0B dark, 
    #00A5A3 teal, #C0F43C lime — match exactly what's in admin/page.tsx
  - Gap detection is best-effort: wrap in try/catch, never fail the ingest
  - Gemini model: gemini-2.5-flash (same as used in ingest route already)
  - Storage is Cloudflare R2 (KB_R2_* env vars) — no AWS
  - Cron jobs use cron-job.org pattern (not relevant here but good to know)
  - The gap conversation UI goes inside the existing ingest flow in admin/page.tsx
    NOT as a separate page — it replaces the direct "Publish" button when gaps exist
  - The gap UI must use radio buttons + optional free text per the PRD spec
    NOT a free-chat interface
  - Processor .md file updates must be safe: read → find section → insert → write back
    Never truncate or overwrite the full file

DATABASE:
  Run supabase/kb_selflearn_migration.sql in Supabase SQL Editor first.

IMPLEMENTATION ORDER:
  Phase 1: Run migration, verify 3 new tables exist
  Phase 2: Create app/lib/kb/gaps.ts with detectGaps() and Gap type
  Phase 3: Create app/lib/kb/update-processor.ts with updateProcessorFile()
  Phase 4: Modify app/api/kb/ingest/route.ts to add second Gemini call + save gap session
  Phase 5: Create app/api/kb/gaps/route.ts (GET gap session)
  Phase 6: Create app/api/kb/gaps/resolve/route.ts (POST resolve, update processor)
  Phase 7: Add gap conversation UI to app/admin/page.tsx (in the ingest flow)
  Phase 8: Add "Pending Gaps" sub-tab to the Knowledge tab in admin/page.tsx

START HERE:
  Read docs/EventPilot-KB-PRD-v3.0.md in full.
  Read app/api/kb/ingest/route.ts to understand the current flow precisely.
  Read app/admin/page.tsx — search for 'showIngestForm' to understand where 
  the gap conversation UI needs to slot in.
  Then confirm what you have read and propose the Phase 1-4 plan before writing 
  any code.
```

---

*EventPilot KB PRD v3.0 | July 2026 | Trescon Global | Internal Confidential*
