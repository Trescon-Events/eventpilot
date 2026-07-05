# Processor: Post-Event Report

## Purpose
This file tells the ingestion pipeline how to process a Trescon post-event report PDF into a structured `.md` summary file ready for KB ingestion and AI retrieval.

---

## Input
- A PDF post-event report (Trescon-branded, 10–60 pages, visual/designed)
- Typical file size: 2–25 MB
- May be text-extractable or partially image-based

## Output
- A structured `.md` file saved to `knowledge-base/events/[managed|signature]/[event-series]/`
- File named: `[YYYY]-[event-slug]-[city]-post-event-report.md`
- A row in Supabase `documents` table with correct metadata
- `source_url` pointing to the original PDF on S3

---

## Extraction Instructions

When processing a post-event report PDF, extract the following sections in this order. If a section is not found in the document, write `Not stated in report.` rather than leaving it blank or inferring.

### Required Sections

**1. Event metadata**
Extract:
- Full event name (as it appears in the report)
- Edition year
- Dates (day, month, year)
- Venue name
- City and country
- Organiser (who officially organised — e.g. DIFC, Trescon, Government of Karnataka)
- Managed by (if Trescon managed but didn't organise)
- Patronage (royal, ministerial, or government endorsement if stated)
- Report type: standalone / part of umbrella week

**2. Overview / summary**
2–4 sentence description of the event as stated or implied in the report. Do not use external knowledge — only what the report says.

**3. Quantitative metrics — Event at a Glance**
Extract all numbered stats. Common ones include:
- Total attendees / participants / delegates / business leaders
- Investors
- Speakers
- Exhibitors / sponsors / partners
- Countries represented
- Sessions / panels / workshops
- Stages
- MoUs signed
- Media representatives

Tag each metric with its source confidence: `stated` (explicitly in the report) or `inferred` (calculated from context).

**4. Attendee profile and buyer insights**
Extract:
- Seniority breakdown (C-suite %, director %, etc.)
- Decision-making authority split
- Top industry sectors represented (with percentages if available)
- Geographic mix (regions or top countries)
- Solutions / technologies attendees were seeking (if stated)
- Revenue / ticket pricing breakdown (if stated)

**5. Themes and topics**
List all officially stated themes. Do not add themes not in the report.

**6. Session titles**
List verified session titles. Note if the list is partial due to image-heavy pages.

**7. Notable speakers**
List speakers named in the report with their title and organisation. Note if the list is partial.

**8. Sponsors and partners**
List by tier (headline, gold, silver, etc.) where stated. List association partners, media partners separately.

**9. Awards and competitions**
List any competitions, startup challenges, or awards programmes with outcomes (winners, prize details).

**10. Media and digital stats**
Extract PR value, media impressions, article counts, social media metrics, TV/radio interviews — whatever is stated.

**11. Key outcomes**
What actually happened as a result — MoUs signed, deals announced, policy outcomes, investment figures.

**12. Testimonials**
List attributed testimonial contributors with name, title, and organisation.

---

## Output Schema

Use this exact markdown structure for the output file:

```markdown
---
title: [Event Name] [Year] [City] — Post-Event Report Summary
event_series: [slug]
event_slug: [YYYY-event-slug-city]
edition_year: [YYYY]
date_start: [YYYY-MM-DD]
date_end: [YYYY-MM-DD]
venue: [Venue]
city: [City]
country: [Country]
division: [managed | signature]
organiser: [Who organised]
managed_by: Trescon
government_patron: [Name / entity, or null]
layer: knowledge_base
department: all
min_level: all
pilot_use: true
source_url: [S3 URL — to be added on upload]
processed_by: ingestion-pipeline
processed_date: [YYYY-MM-DD]
source_file: [original filename]
---

# [Event Name] [Year] — Post-Event Report Summary

## Event Overview
[2–4 sentences from the report]

## Key Metrics
[Table of all stats]

## Attendee Profile
[Seniority, sectors, geography, decision-making authority]

## Themes and Topics
[Bulleted list]

## Session Highlights
[Verified session titles]

## Notable Speakers
[Name, title, organisation — as table]

## Sponsors and Partners
[By tier]

## Awards and Competitions
[Outcomes]

## Media and PR
[Stats]

## Key Outcomes
[What was achieved]

## Testimonials
[Attributed quotes]

## Data Quality Notes
[OCR issues, partial pages, anything uncertain]

---
*Source: [original filename] | Processed: [date] | S3: [url]*
```

---

## Where to Save the Output

| Event division | Save to |
|---|---|
| Dubai FinTech Summit | `knowledge-base/events/managed/dubai-fintech-summit/` |
| Dubai AI Festival | `knowledge-base/events/managed/dubai-ai-festival/` |
| Future Sustainability Forum | `knowledge-base/events/managed/future-sustainability-forum/` |
| Bengaluru Skill Summit | `knowledge-base/events/managed/bengaluru-skill-summit/` |
| World AI Show | `knowledge-base/events/signature/world-ai-show/` |
| HODL / WBS | `knowledge-base/events/signature/hodl/` |
| Big CIO Show | `knowledge-base/events/signature/big-cio-show/` |
| World CX Summit | `knowledge-base/events/signature/world-cx-summit/` |
| World Cyber Security Summit | `knowledge-base/events/signature/world-cyber-security-summit/` |
| New/unknown series | `knowledge-base/events/[managed|signature]/[new-series-slug]/` |

If the event series doesn't exist yet, create the folder and update the master series `.md` file for that series to reference the new edition.

---

## Quality Rules

- Never infer facts not stated in the report
- Never merge stats from different editions
- If a number appears inconsistently across pages, note both figures and flag in Data Quality Notes
- Speaker names must appear in the report — do not add from memory
- Testimonials must be attributed — anonymous quotes are not included
