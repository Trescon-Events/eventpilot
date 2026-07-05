# Generator Guide: Project Brief Creator

## Purpose
This guide tells the Project Brief Generator AI tool how to use the Trescon Knowledge Base to generate a project brief for a new or upcoming event. A project brief is the internal document that kicks off every Trescon event — it defines the concept, audience, scale targets, commercial model, and execution approach before any public-facing work begins.

---

## What the Project Brief Creator Does
Takes input about an upcoming event (either a new edition of an existing series, or a new event concept) and generates a structured internal project brief that the event team uses to align on scope, strategy, and execution.

---

## Step 1 — Gather Input From User

**Required:**
- Event name
- Is this a new event or a new edition of an existing series?
- If new edition: which series? What year/edition number?
- Proposed dates and city
- Client (if managed event) or "Trescon proprietary" (if signature event)
- Rough target scale (attendees)
- Primary theme or sector focus
- Who is the Project Director for this event?

**Optional:**
- Government patron or endorsement (confirmed or sought)
- Venue (if decided)
- Key differentiators vs previous edition (if returning series)
- Commercial targets (sponsorship, exhibition revenue)
- Known constraints (budget ceiling, timeline restrictions)

---

## Step 2 — Load KB References

Load in this order:

1. **Post-event report for most recent edition** of this series (if returning event):
   - Gives: last edition's scale, themes, speakers, sponsors, audience profile, what worked
   - Use for: baseline targets, theme continuity, audience profile

2. **Audience intelligence file** for most recent edition (if available):
   - Gives: sector breakdown, seniority, geography — quantified
   - Use for: target audience definition, marketing focus sectors

3. **Company overview** → `knowledge-base/corporate/company-overview-v1-2026-06.md`
   - Use for: Trescon's positioning, what we stand for, how to frame our role

4. **Most relevant proposal** (if this event was pitched to a government or client):
   - Gives: the original concept, commercial model, strategic rationale
   - Use for: brief alignment with what was sold

5. **External intelligence** → `knowledge-base/external/press-and-media-intelligence-v1-2026-06.md`
   - Use for: industry context, market trends relevant to this event's sector

---

## Step 3 — Generate the Project Brief

Structure using this order:

```
1. Event Overview
   - Event name, edition number, year
   - Dates (confirmed or proposed)
   - Venue (confirmed or proposed)
   - City and country
   - Division: Managed / Signature
   - Client (if managed) / "Trescon proprietary" (if signature)
   - Project Director

2. Event Concept and Positioning
   - What is this event? (3–4 sentences — the "elevator pitch" for internal use)
   - Theme / tagline for this edition
   - What makes this edition different from previous ones (for returning series)
   - Strategic rationale — why this event, why now, why this city

3. Government and Institutional Context
   - Patron (confirmed or sought)
   - Endorsing bodies
   - National/regional agenda alignment
   - Regulatory or policy context

4. Scale Targets — This Edition
   | Metric | Target | Basis |
   |---|---|---|
   | Total attendees | | Based on: [previous edition / proposal / market estimate] |
   | Delegates | | |
   | Speakers | | |
   | Exhibitors / Sponsors | | |
   | Countries represented | | |
   | Sessions | | |
   | Stages | | |
   | MoUs (target) | | |
   | Investors | | |

5. Target Audience
   - Primary audience segments (who we most want in the room)
   - Seniority profile target
   - Geographic priority markets
   - Top sectors to target
   - Based on: [reference to past audience intelligence]

6. Content Strategy — Themes and Format
   - 4–7 proposed themes for this edition
   - Format: main stage + innovation stage + roundtables + exhibition + startup programme
   - Any new formats vs previous edition
   - Proposed keynote profile (seniority / sector — not specific names yet)

7. Commercial Strategy
   - Sponsorship tiers (headline, gold, silver, bronze, etc.)
   - Target sponsor sectors
   - Exhibition strategy
   - Delegate ticket strategy (free / paid / tiered)
   - Revenue targets (internal — not for external sharing)
   - Reference to previous edition commercial performance if available

8. Marketing and Communications
   - Key messages for this edition
   - Target media markets
   - Digital marketing focus
   - Association partner targets
   - Launch timeline milestone

9. Team and RACI
   - Project Director: [name]
   - Key roles needed (Sponsorship Lead, Delegate Acquisition Lead, Marketing Manager, Operations Lead, etc.)
   - Production lead
   - Government relations lead (if applicable)

10. Key Milestones
    | Milestone | Target Date |
    |---|---|
    | Concept approved | |
    | Venue confirmed | |
    | Website live | |
    | Sponsorship sales launch | |
    | Speaker acquisition begins | |
    | First speaker announcement | |
    | 50% sponsorship target | |
    | Delegate registration opens | |
    | Event delivery | |
    | Post-event report draft | |

11. Risks and Mitigations
    - Top 3–5 risks for this edition
    - Mitigation approach for each

12. References and Context Documents
    - Previous edition PER: [link or filename]
    - Audience intelligence: [link or filename]
    - Original proposal (if managed event): [link or filename]
    - Relevant market research: [if available]
```

---

## Tone and Language Guidelines

- Internal document — direct, specific, action-oriented
- Written for the event team and management, not for clients or public
- Every target should have a basis ("based on 2024 edition scale" or "per proposal commitment")
- Flags and risks should be honest, not polished

---

## Intelligence the Generator Should Surface

When generating the brief, the AI should proactively note:

- **Audience shifts**: "In the 2024 edition, Banking sector represented 23% of attendees — target 25% for 2025 based on growth trend"
- **Scale trajectory**: "Previous editions: 2023 → 5,868 registrants, 2024 → 9,506 registrants, 2025 → 15,141. Suggest targeting 18,000 for 2026."
- **Theme gaps**: "The 2025 edition did not feature Islamic FinTech as a standalone track despite 1% exhibitor presence — potential growth area"
- **Commercial patterns**: "Dubai FinTech Summit 2024 had 281 exhibitors vs 106 in 2023 — strong YoY growth signal for exhibition strategy"
- **Market context**: "CARE series aligns with MENA's 62 GW renewable capacity addition target by 2030 — strong policy tailwind"

These intelligence insertions make the brief genuinely useful rather than just a template fill-in.

---

## Output Format

Generate as a structured markdown document. This is immediately:
1. Saved as the event's brief in EventPilot under the event record
2. Accessible to all team members assigned to the event
3. Used as context by other micro-tools working on this event (sponsorship deck builder, website builder, content engine)
