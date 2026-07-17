# Processor: Proposal / Pitch Deck

## Purpose
This file tells the ingestion pipeline how to process a Trescon business proposal or pitch deck (PDF or PPTX) into a structured `.md` reference file for the BD Vault.

---

## Input
- A PDF or PPTX proposal / pitch deck / RFQ response
- Typical file size: 2–200 MB (slide decks can be large)
- May be a proactive Trescon-conceptualised pitch, or a response to a government RFQ/tender

## Output
- A structured `.md` file saved to `knowledge-base/bd/proposals/[client-slug]/`
- File named: `[client-slug]-proposal.md`
- A row in Supabase `documents` table with restricted metadata (`layer: specific`, `min_level: team_lead`, `pilot_use: false`)
- `source_url` pointing to the original file on S3

---

## Classification: Proposal Types

**Type A — Proactive proposal (Trescon-conceptualised):**
Trescon developed the event concept and pitched it to a government or organisation. Signals: "proposed by Trescon", "organised by [client] in partnership with Trescon", Trescon logo appears first or prominently.

**Type B — RFQ / Tender response:**
A government or organisation issued a Request for Proposal or RFQ, and Trescon responded. Signals: "RFQ", "technical proposal", "submitted by", "scope of work", numbered evaluation criteria.

**Type C — Capability / credential deck:**
A Trescon credentials presentation sent to a prospect. Signals: heavy credential content, portfolio of past events, "why Trescon" section, no specific event concept.

Tag the output with the correct proposal type.

---

## Extraction Instructions

Extract the following sections. Write `Not stated in document.` for anything not found. Do not infer.

### Required Sections

**1. Proposal metadata**
- Client / prospect name (full official name)
- Client type: government body / private enterprise / NGO / other
- Country / city
- Event concept name (the proposed event)
- Proposal type: A (proactive) / B (RFQ response) / C (credential deck)
- Approximate date of proposal (if visible)
- Trescon's proposed role: full management / content only / commercial only / advisory
- Document filename

**2. Event concept**
What is the proposed event? In 3–5 sentences: theme, format, expected audience, purpose, strategic rationale.

**3. Strategic rationale / market gap**
Why does this event need to exist? What gap does it fill? What national/regional agenda does it align with?

**4. Proposed event scale**
Extract target numbers: attendees, speakers, exhibitors, countries, investors, sessions. Note if these are projections (Year 1 / Year 2 / Year 3).

**5. Target audience**
Who is intended to attend? List audience segments, stakeholder types, and target seniority levels.

**6. Themes and tracks**
List proposed themes, topic tracks, or content pillars.

**7. Format and activations**
What formats are proposed? (Main stage, roundtables, exhibition, startup competition, networking, etc.)

**8. Commercial model**
Extract:
- Who funds the event (client covers costs vs. shared vs. commercial)
- Revenue streams (sponsorship, exhibition, ticketing, government support)
- Revenue sharing model if stated (e.g. 50:50 post-expense)
- Indicative budget if stated
- IP ownership model

**9. Trescon's scope of work**
What specifically does Trescon deliver? List all responsibilities.

**10. Client's responsibilities**
What does the client provide or deliver?

**11. Trescon credentials referenced**
Which past Trescon events are cited as proof of capability in this proposal? List them.

**12. Governance / partnership structure**
Joint steering committee, co-ownership, endorsement structure.

**13. Timeline / roadmap**
Key milestones, activation timeline, multi-year roadmap if stated.

**14. Next steps stated**
What action does the proposal request from the prospect?

---

## Learned Fields (Self-Learning)

Fields confirmed by uploaders that extend the sections above.

### Strategic Rationale

- **Market Landscape Analysis** (optional)
  - Description: In this document, we are proposing Dubai Silicon Oasis (DSO) with an initiative called Futuretech Innovation & Ecosystemt Management Strategy. As part of this we are pitching them to host 3 different events: STRIDE (Science, Technology Research, Innovation & Development, Future Venture Capital Forum, and Dubai FutureTech Festival. As part of the pitch, in the second slide, we tried to show the current competitor events in this space, their strengths and Gaps, how our proposed events can fill that gap. also, we tried to show how DSO can claim this space with their own strengths.
  - Example: `GITEX Global: Large-scale visibility, Broad not conversion-led. LEAP: Regional scale, General tech not DSO-owned. STEP Conference: Startup exposure, Limited investor conversion.`
  - Field name: `market_landscape_analysis`
  - *Added: 2026-07-10*

- **Expected Outcomes** (required)
  - Description: Yes. Our proposals did not have this level of detail. But going forward we will have, This is also required.
  - Example: `Tangible ROI: number of qualified leads generated, number of startups exploring DSO establishment, number of pilots, partnerships, companies established. Strategic Intangible ROI: stronger international visibility for DSO, improved investor confidence in the DSO proposition.`
  - Field name: `expected_outcomes`
  - *Added: 2026-07-10*

- **National Strategic Alignment Agendas** (required)
  - Description: Its important in any proposal. Keep it
  - Example: `Dubai's D33 Agenda, UAE Digital Economy Strategy, Operation 300bn, Vision 2030`
  - Field name: `national_strategic_alignment_agendas`
  - *Added: 2026-07-13*

- **Client Unique Strategic Assets** (optional)
  - Description: yes that is correct. Keep it.
  - Example: `Startup engine, Pilot environment, Business establishment, Integrated economic zone, R&D expansion`
  - Field name: `client_unique_strategic_assets`
  - *Added: 2026-07-13*

- **Competitor Event Analysis** (optional)
  - Description: This slide talks about benchmarking competitor events, identify gaps in those events that our proposed event will fill in. This is an important information to inlcude in the proposal. Keep it.
  - Example: `Future Technologies Conference (FTC 2025): Large-scale, Europe-focused; excels in Al/robotics demos. Misses STEM integration and policy outcomes - Dubai STEM Summit fills this gap.`
  - Field name: `competitor_event_analysis`
  - *Added: 2026-07-15*

### Event Concept

- **Proposed Event Platforms** (optional)
  - Description: This proposal is pitched as an initiative called "Futuretech Innovation & Ecosystem Management Strategy". its more of a strategy pitch. And as part of the pitch we are proposing 3 distinct events that the client should host. We will have to have separate sections for such proposals where there are multiple events proposed. Because each event will be elaborated and talked about in the proposal.
  - Example: `PLATFORM 1: STRIDE (Sep 2026, Role: Research Engine, Scale: 500 attendees). PLATFORM 2: Future VC (Nov 2026, Role: Capital Engine, Scale: 300 delegates). PLATFORM 3: Dubai FutureTech Festival (Mar 2027, Role: Global Flagship, Scale: 5,000+ delegates).`
  - Field name: `proposed_event_platforms`
  - *Added: 2026-07-10*

- **Event Differentiators** (optional)
  - Description: This is also part of competitor analysis. Keep it.
  - Example: `Government-Led Innovation Clinic: On-site tracks with Ministry of Al and TECOM to fast-track STEM projects (briefings, templates, checklists). Gap addressed: Peers lack jurisdiction-specific 'clinics.'`
  - Field name: `event_differentiators`
  - *Added: 2026-07-15*

### Format and Activations

- **Pre Event Activations** (optional)
  - Description: Yes. we sometimes propose "pre-event activations" as well as "on-site activations", both.
  - Example: `DAILTECH Onsite Cluster Dialogues, Podcast, FutureTech Friday Meet up. Frequent Cluster Dialogues / Meetups led by DTEC to build momentum during non event months.`
  - Field name: `pre_event_activations`
  - *Added: 2026-07-10*

- **Post Event Activations** (optional)
  - Description: this is proposed in some cases. in order to extend the value of the event further after the event, we proposed a few engagement activities after the event also. keep it.
  - Example: `POST EVENT: Cluster visit for international delegates the day after the event, STEM World Cup`
  - Field name: `post_event_activations`
  - *Added: 2026-07-15*

### Target Audience

- **Audience Engagement Purpose** (required)
  - Description: Yes. Some of our previous propsoals did not have this level of breakdown. But going forward we intend to have this. this is required.
  - Example: `Government & Regulators -> Key Personas: Ministers, Policy Advisors; Purpose of Engagement: Showcase tech-friendly policies, facilitate collaborations, align national goals, reinforce Dubai as a secure global hub.`
  - Field name: `audience_engagement_purpose`
  - *Added: 2026-07-10*

### Proposal metadata

- **Client Internal Ecosystem Components** (optional)
  - Description: Those entities are part of DSO. and aligning our proposed strategy with these entities help us in establishing our strategy better which is "A mandate-led platform strategy — not an events strategy." So the way we are showing the seven priority clusters are also keeping in mind the same idea.
  - Example: `DTEC as startup engine, Dubai Digital Park as pilot environment, District 10 as R&D expansion`
  - Field name: `client_internal_ecosystem_components`
  - *Added: 2026-07-13*

### Themes and tracks

- **Client Strategic Tech Clusters** (optional)
  - Description: That is correct.. Keep it.
  - Example: `PropTech, Robotics, Mobility, MedTech, Cybersecurity, Deep/Quantum, AI`
  - Field name: `client_strategic_tech_clusters`
  - *Added: 2026-07-13*

### Trescon's Scope of Work

- **Partnership Strategic Nature** (optional)
  - Description: strategic_consulting
  - Example: `Not an event organiser. An ecosystem builder. A mandate-led platform strategy – not an events strategy.`
  - Field name: `partnership_strategic_nature`
  - *Added: 2026-07-13*

### Governance / Partnership Structure

- **Envisioned Partners** (required)
  - Description: Its a mix of all sorts of potential and relevant partners for the event.  It includes all the above such as government entities, industry leaders, solution providers, media, Academy, thought leaadership etc.. keep it.
  - Example: `Government Partners: UNITED ARAB EMIRATES MINISTER OF STATE FOR ARTIFICIAL INTELLIGENCE... Industry Partners: Pfizer, Microsoft. Academic Partners: MIT, Stanford University. Media Partners: Bloomberg, CNN.`
  - Field name: `envisioned_partners`
  - *Added: 2026-07-15*

### Commercial Model / Expected Outcomes

- **Indirect Outcomes** (optional)
  - Description: This is more or less an indirect outcomes from the proposed event that is directly related to the client's business operations.
  - Example: `Commercial & Residential Real Estate, Employee & Dependant Visas, Business Licensing, Retail & F&B`
  - Field name: `indirect_outcomes`
  - *Added: 2026-07-15*
---

## Output Schema

```markdown
---
title: [Client Name] — [Event Name] Proposal
client_name: [Full client name]
client_type: [government | private | ngo | other]
client_country: [Country]
event_concept: [Proposed event name]
proposal_type: [A-proactive | B-rfq | C-credential]
trescon_role: [full-management | content | commercial | advisory]
layer: specific
department: events
min_level: team_lead
pilot_use: false
source_url: [S3 URL — to be added on upload]
processed_by: ingestion-pipeline
processed_date: [YYYY-MM-DD]
source_file: [original filename]
---

# [Client Name] — [Event Name] Proposal

## Proposal Overview
**Client:** [Full name]
**Proposed event:** [Event name]
**Proposal type:** [Proactive / RFQ response / Credential deck]
**Trescon's role:** [Full management / Content / Commercial / Advisory]

## Event Concept
[3–5 sentence description of the proposed event]

## Strategic Rationale
[Why this event needs to exist — market gap, national agenda alignment]

## Proposed Scale
[Target numbers — attendees, speakers, exhibitors, countries, investors]

### Multi-Year Projections (if stated)
| Metric | Year 1 | Year 2 | Year 3 |
|---|---|---|---|

## Target Audience
[Segments, stakeholder types, seniority levels]

## Themes and Content Tracks
[Bulleted list]

## Format and Activations
[Event formats proposed]

## Commercial Model
[Who funds, revenue streams, revenue share, indicative budget, IP ownership]

## Trescon's Scope of Work
[What Trescon delivers]

## Client Responsibilities
[What the client provides]

## Trescon Credentials Referenced
[Past events cited as proof of capability]

## Partnership and Governance Structure
[Steering committee, co-ownership, endorsements]

## Timeline and Roadmap
[Key milestones, activation phases]

## Next Steps (as stated in proposal)
[What action was requested]

## Notes for Future Reference
[Anything useful for teams working on similar proposals — unique angles, language that worked, structural elements worth reusing]

---
*Source: [original filename] | Type: [proposal type] | Processed: [date] | S3: [url]*
```

---

## Where to Save the Output

```
knowledge-base/bd/proposals/[client-slug]/[client-slug]-proposal.md
```

Client slug examples:
- Dubai Silicon Oasis → `dso-futuretech-ecosystem`
- Dubai Land Department → `dld-livingsphere`
- Oman Investment Authority → `stripe-oman`

---

## Quality Rules

- Include the indicative budget figure if it appears in the document — this is useful reference for future similar pitches
- Do not include individual contact names or email addresses of client-side personnel
- The "Notes for Future Reference" section is written by the processor, not extracted — use it to flag what's structurally interesting or reusable about this proposal
- If the proposal is a joint bid with another company (e.g. Wizcraft), clearly note this and tag `joint_bid: true` in the front matter
