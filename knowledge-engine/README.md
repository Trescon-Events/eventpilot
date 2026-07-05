# Trescon Knowledge Engine

The Knowledge Engine is the operational intelligence layer of EventPilot's KB system. It defines how documents are classified, processed, stored, and used by AI tools.

---

## What Lives Here

```
knowledge-engine/
├── README.md                      ← This file
├── classifiers/
│   └── document-classifier.md    ← Rules for auto-classifying uploaded documents
├── processors/
│   ├── post-event-report.md      ← How to process a PDF post-event report into .md
│   ├── proposal.md               ← How to process a proposal/pitch deck into .md
│   ├── attendee-data.md          ← How to process xlsx attendee files
│   └── corporate-doc.md          ← How to process company/portfolio documents
├── generators/
│   ├── proposal-creator.md       ← How to CREATE a new proposal using KB
│   ├── per-creator.md            ← How to CREATE a new post-event report using KB
│   └── project-brief-creator.md  ← How to CREATE a project brief using KB
└── scripts/
    └── ingest.mjs                ← Ingestion script (classify → process → store)
```

---

## The Ingestion Pipeline

When a new document is uploaded to EventPilot or dropped into `knowledge-base/_inbox/`:

```
File uploaded / dropped in _inbox/
          │
          ▼
    CLASSIFY (document-classifier.md)
    Determine: what type is this?
          │
          ▼
    PROCESS (matching processor file)
    Extract content → generate .md summary
    Tag with correct metadata
          │
          ▼
    STORE (two places simultaneously)
    Original file → S3 (for download)
    .md summary  → Supabase documents table (for AI search)
          │
          ▼
    DONE — document immediately queryable by Pilot AI
    and all micro-tools. Original available for download.
```

---

## The Inbox

`knowledge-base/_inbox/` is the drop zone for new documents.

**Naming convention for inbox files** (helps the classifier):

| Prefix | Document type |
|---|---|
| `per-` | Post-event report (e.g. `per-wais-2026-dubai.pdf`) |
| `proposal-` | New business proposal (e.g. `proposal-qatar-ai-summit.pdf`) |
| `attendee-` | Attendee data file (e.g. `attendee-wais-2026-dubai.xlsx`) |
| `corporate-` | Company/portfolio document |
| `press-` | Press release or media article |

If no prefix is used, the classifier uses content analysis to determine the type.

---

## For Claude Code — Future Admin UI

The ingestion pipeline should be triggered by:

1. Admin uploads file via EventPilot admin panel → Knowledge Base → Upload
2. System calls `/api/kb/ingest` endpoint
3. Endpoint runs classifier + appropriate processor using Gemini
4. Writes `.md` summary to Supabase `documents` table
5. Uploads original to S3, stores URL in `source_url` field
6. Returns success with document ID and generated summary preview
7. Admin reviews summary and clicks "Publish to KB"
