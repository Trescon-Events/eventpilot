# Processor: Corporate / Company Document

## Purpose
Processes company profile documents, services portfolios, press releases, media articles, and other corporate-level documents into structured KB entries.

---

## Input Types This Processor Handles
- Trescon company profile / credentials deck
- Services portfolio document
- Press release issued by Trescon
- Third-party media article about Trescon
- Annual review or milestone announcement
- Government letter or endorsement

## Output
- A structured `.md` file saved to the appropriate KB folder
- Seeded into Supabase with `layer: knowledge_base`, `pilot_use: true`

---

## Routing by Sub-type

| Sub-type | Save to | Filename pattern |
|---|---|---|
| Company profile / credentials | `knowledge-base/corporate/` | `company-overview-v[N]-[YYYY-MM].md` |
| Services portfolio | `knowledge-base/corporate/` | `services-portfolio-v[N]-[YYYY-MM].md` |
| Press release (Trescon-issued) | `knowledge-base/external/` | `press-[YYYY-MM]-[slug].md` |
| Media article (third-party) | `knowledge-base/external/` | `media-[YYYY-MM]-[slug].md` |
| Government endorsement | `knowledge-base/corporate/` | `endorsement-[entity]-[YYYY].md` |

---

## Extraction Instructions

### Company profile / credentials
Extract:
- Company name, founding year, HQ
- Mission / vision / positioning statement
- Key statistics (events run, countries, attendees, etc.)
- Business divisions and their descriptions
- Leadership names and titles
- Geographic presence
- Key government partnerships
- Awards or recognition

### Services portfolio
Extract:
- List of services offered with descriptions
- Target client types for each service
- Differentiators stated

### Press release
Extract:
- Date of release
- Headline
- Key announcement (what happened)
- Quotes (attributed with name, title, company)
- Event or context it relates to
- Distribution channels mentioned

### Media article
Extract:
- Publication name and date
- Article headline
- Key claims about Trescon
- Quotes attributed to Trescon leadership
- Context (what event or announcement triggered coverage)

---

## Output Schema (Corporate)

```markdown
---
title: [Document title]
document_type: [company_profile | services_portfolio | press_release | media_article | endorsement]
version: [N]  ← increment for company_profile and services_portfolio
date: [YYYY-MM]
owner: Corporate Marketing Director
layer: knowledge_base
department: all
min_level: all
pilot_use: true
source_url: [S3 URL if applicable]
supersedes: [previous version ID or null]
processed_by: ingestion-pipeline
processed_date: [YYYY-MM-DD]
source_file: [original filename]
---

# [Document Title]

[Structured content following extraction instructions above]

---
*Processed: [date] | Owner: [owner] | Version: [N]*
```

---

## Version Control Rule

For `company_profile` and `services_portfolio` documents:
- Always check if a previous version exists in `knowledge-base/corporate/`
- If yes, the new file supersedes it
- Set `supersedes: [old_document_id]` in the new file's front matter
- In Supabase, update the old row to set `superseded_by = [new_id]`
- The old file remains on disk — never delete previous versions

---

## Quality Rules

- For press releases and media articles: preserve exact quotes with attribution
- Do not update statistics in existing corporate documents by inference — only update when a new versioned document is explicitly uploaded
- Mark any statistics with their source date so staleness can be detected
