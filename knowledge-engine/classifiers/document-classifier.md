# Document Classifier

## Purpose
This file defines the rules for automatically classifying any document uploaded to EventPilot's Knowledge Base. The ingestion script reads this file to determine which processor to apply.

---

## Classification Decision Tree

### Step 1 — Check filename prefix (fastest signal)

| Prefix | Type | Processor |
|---|---|---|
| `per-` | Post-event report | `processors/post-event-report.md` |
| `proposal-` | Business proposal | `processors/proposal.md` |
| `attendee-` | Attendee data | `processors/attendee-data.md` |
| `corporate-` | Corporate/company document | `processors/corporate-doc.md` |
| `press-` | Press release / media | `processors/corporate-doc.md` |
| `rfq-` | Tender / RFQ response | `processors/proposal.md` |
| `tender-` | Tender / RFQ response | `processors/proposal.md` |

### Step 2 — Check file extension

| Extension | Likely types |
|---|---|
| `.pdf` | Post-event report, proposal, corporate doc, press |
| `.pptx` / `.ppt` | Proposal, corporate doc |
| `.xlsx` / `.xls` | Attendee data |
| `.md` | Pre-processed — seed directly, no processing needed |

### Step 3 — Content analysis (when prefix and extension are ambiguous)

Scan the first 2 pages / 500 words of the document for these signals:

**Post-event report signals:**
- Contains: "post-event report", "event highlights", "attendees", "speakers", "sessions held", "sponsors", "media coverage", year + event name in title
- Usually PDF, 10–50 pages, visual/branded

**Proposal signals:**
- Contains: "proposal", "presented by Trescon", "organized by", "managed by Trescon", "partnership model", "budget", "AED", "USD", "indicative investment", "three-year roadmap", "next steps"
- Usually PDF or PPTX, 10–35 pages, pitch deck format

**Attendee data signals:**
- File is `.xlsx` or `.xls`
- First row contains: "company", "name", "job title", "registration type", "category", "industry"
- Has multiple rows of data

**Corporate document signals:**
- Contains: "about Trescon", "our services", "our divisions", "company profile", "portfolio", "credentials"
- Usually PDF, company brochure style

**Press / media signals:**
- Contains: "press release", "for immediate release", "media contact", news publication name
- Short (1–5 pages)

---

## Metadata Tagging Rules

After classification, tag each document with:

| Field | Post-Event Report | Proposal | Attendee Data | Corporate |
|---|---|---|---|---|
| `type` | `event_report` | `proposal` | `other` | `corporate_profile` |
| `layer` | `knowledge_base` | `specific` | `specific` | `knowledge_base` |
| `department` | `all` | `events` | `events` | `all` |
| `min_level` | `all` | `team_lead` | `team_lead` | `all` |
| `pilot_use` | `true` | `false` | `false` | `true` |
| `source_url` | S3 link to PDF | S3 link to PDF/PPTX | S3 link to xlsx | S3 link |

---

## Edge Cases

**File is a PPTX converted to PDF (e.g. `proposal.pptx.pdf`):**
Treat as proposal. The `.pptx.pdf` naming pattern indicates a slide deck exported to PDF.

**File has no useful text (scanned/image-only PDF):**
Flag as `requires_ocr: true` and notify admin. Do not process automatically — OCR required first.

**File is very large (>50 MB):**
Process first 20 pages + last 5 pages only. Note in the generated `.md` that extraction is partial.

**File already exists in KB (same name or highly similar content):**
Flag as potential duplicate. Ask admin to confirm before processing.
