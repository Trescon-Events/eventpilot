# Processor: Attendee Data

## Purpose
This file tells the ingestion pipeline how to process an attendee data xlsx file into a cleaned, structured file plus an audience intelligence summary ready for the KB.

---

## Input
- An xlsx or xls file containing event registrant data
- Typical columns: company, name, job title, industry, country, attendee category, ticket type, amount paid

## Output — Two files

**1. Cleaned xlsx** saved to `knowledge-base/Attendee Data Historical/_source/[managed|signature]/[series-slug]/[YYYY]-[event-slug]-[city].xlsx`
- PII stripped (email, phone, mobile, badge ID, welcome call, comments)
- Internal staff rows removed (Trescon, vmeets, DIFC, KSDC, KSDA)
- Columns standardised to: `company`, `full_name`, `job_title`, `industry`, `country`, `attendee_category`, `ticket_type`, `amount_paid`, `city`, `event_name`

**2. Audience intelligence `.md`** saved to `knowledge-base/events/[managed|signature]/[series-slug]/[YYYY]-[event-slug]-[city]-audience.md`
- Aggregated stats — no individual records
- Seeds into Supabase as a `knowledge_base` layer document
- This is what Pilot AI and micro-tools actually query

---

## Standard Column Mapping

When processing, map source column names to these standard names:

| Standard field | Maps from (any of these) |
|---|---|
| `company` | Company, Company name, Organisation, Organization |
| `full_name` | Full Name, or combine First Name + Last Name |
| `job_title` | Job Title, Position, Designation / Job Title |
| `industry` | Industry Sector, Industry |
| `country` | Country, Country of Residence, Country Of Residence |
| `attendee_category` | Registration Type, Category, Attendee Category, Type |
| `ticket_type` | Ticket Type, Paid or Free |
| `amount_paid` | Amount Paid, Amount already paid (numeric, 0 if free) |
| `city` | City |
| `event_name` | Event Registered (or derive from filename) |

Columns not in this list are dropped.

---

## Internal Staff Exclusion List

Remove any row where the `company` field contains (case-insensitive):
- trescon
- vmeets
- vmeetsworld
- difc
- ksdc (karnataka skill development corporation)
- ksda (karnataka skill development authority)

---

## Audience Intelligence Summary Schema

The `.md` file generated from the data must follow this schema:

```markdown
---
title: [Event Name] [Year] [City] — Audience Intelligence
event_series: [slug]
event_slug: [YYYY-event-slug-city]
edition_year: [YYYY]
city: [City]
country: [Country]
division: [managed | signature]
total_registrants: [N]
layer: knowledge_base
department: all
min_level: all
pilot_use: true
source_url: [S3 URL of cleaned xlsx]
processed_by: ingestion-pipeline
processed_date: [YYYY-MM-DD]
source_file: [original filename]
---

# [Event Name] [Year] — Audience Intelligence

## Summary
- **Total registrants analysed:** [N] (after removing internal staff)
- **Event:** [Full event name]
- **Year:** [YYYY]
- **City:** [City], [Country]

## Attendee Category Breakdown
| Category | Count | % |
|---|---|---|
| Delegate | | |
| Speaker | | |
| Sponsor | | |
| Exhibitor | | |
| Investor | | |
| Government | | |
| Media | | |
| Organizer | | |
| Other | | |

## Top Industries Represented
| Industry | Count | % |
|---|---|---|
(Top 15, sorted by count descending)

## Top Countries Represented
| Country | Count | % |
|---|---|---|
(Top 20, sorted by count descending)

## Seniority Breakdown
Inferred from job titles using these rules:
- C-suite: CEO, CFO, CTO, CIO, COO, CMO, CISO, CSO, Chairman, Founder, Managing Director, Managing Partner
- VP / Director level: VP, Vice President, Director, Head of, SVP, EVP
- Manager level: Manager, Senior Manager, Lead
- Other: everything else

| Level | Count | % |
|---|---|---|
| C-suite / Founder | | |
| VP / Director | | |
| Manager / Lead | | |
| Other / Not stated | | |

## Top Companies Represented
(Top 20 by registrant count, minimum 2 registrants)
| Company | Count |
|---|---|

## Revenue Analysis
(Only for files containing payment data)
| Metric | Value |
|---|---|
| Total paid registrants | |
| Total free registrants | |
| Gross revenue from ticket sales | |
| Average ticket value (paid only) | |
| Top paying industry | |

## Revenue by Industry
(If payment data available)
| Industry | Paid Registrants | Revenue | Avg Ticket |
|---|---|---|---|

## Notes
[Any data quality observations — sparse fields, inconsistent categories, etc.]

---
*Source: [original filename] | Processed: [date] | Cleaned file: [S3 url]*
```

---

## Seniority Inference Rules

These keyword lists are used to infer seniority from job titles. Apply in order — first match wins.

**C-suite / Founder:**
CEO, CFO, CTO, CIO, COO, CMO, CISO, CSO, CPO, CRO, CDO, Chairman, Chairwoman, Chairperson, Founder, Co-Founder, Co-founder, Managing Director, Managing Partner, Executive Director, President, Group CEO, Group MD, Proprietor, Owner, Principal

**VP / Director level:**
Vice President, VP, SVP, EVP, AVP, Director, Head of, Global Head, Regional Head, Head - , Head,  Partner (at non-founder companies), General Manager, GM, Country Manager, Regional Manager, Senior Director, Associate Director

**Manager / Lead:**
Manager, Senior Manager, Team Leader, Team Lead, Lead, Senior Lead, Supervisor, Associate Manager, Assistant Director, Deputy Director

**Other:** anything not matched above

---

## Quality Rules

- Never include individual names, emails, or phone numbers in the `.md` summary
- All numbers in the summary are aggregated — no individual records
- Round percentages to one decimal place
- For sparse fields (e.g. Industry missing for >30% of rows), note this in the Notes section
- Revenue figures should use the currency as found in the data (AED, USD, INR etc.) — do not convert
