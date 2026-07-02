# EventPilot — Pilot Projects Tracker

> **What is a Pilot Project?**
> A Pilot Project is a micro-tool build led by a subject matter expert ("Pilot") in collaboration with Durga.
> The Pilot owns the scope, writes prompts using the SME Context Guide, and is accountable for the outcome.
> Durga builds. Madhu sets direction and is available for strategic input — not day-to-day decisions.

**Live tracker:** `eventpilot.tresconglobal.com/pilots` (for Pilots) · `/admin/pilots` (for admins)

---

## Active Projects

### 1. Bespoke Event Module

| Field | Detail |
|---|---|
| Status | Active — Pre-Build |
| Initiated | 19 Jun 2026 |
| Pilot (Main) | Nicholas Nunes · nicholas@tresconglobal.com · Marketing Director ME |
| Consulting | Thulasi Devi S · thulasi@tresconglobal.com · Marketing Director |
| Tracking | Fouzan Abdul Rahim · fouzan@tresconglobal.com · Performance Marketing Lead |

**What it is:** A purpose-built workflow within the existing Events section of EventPilot for managing Bespoke (client) events. Event type will be `Bespoke` (alongside existing `Flagship` and `Managed`). Covers brand ingestion from client brief, landing page generation with Konfhub registration, multi-channel marketing plan, content generation for all channels, and social scheduling.

**Key open questions (Nicholas + Durga to decide):**
- [ ] Is EventPilot Phase 1 content-generation only, or does it also handle scheduling/publishing?
- [ ] Which outreach channels are in Phase 1 (HubSpot/Zoho/Brevo, WhatsApp, Closely)?
- [ ] Is the marketing plan a static generated document or a live tracker in Phase 1?
- [ ] Do Bespoke social posts flow through the existing Content Hub or a separate pipeline?

**Preliminary content needed (Nicholas to prepare):**
- [ ] 10 best landing pages from previous Bespoke events
- [ ] 10 best delegate outreach emailers
- [ ] 2–3 Closely workflow templates for LinkedIn automation
- [ ] 20 social media posts from previous events

**Access:**
- Nicholas: `website_builder`, `bespoke` ✓
- Thulasi: `content`, `brand_studio` ✓
- Fouzan: `content` ✓ (set 1 Jul 2026)

---

### 2. Corporate Marketing Module

| Field | Detail |
|---|---|
| Status | Active — Pre-Build |
| Initiated | 18–19 Jun 2026 |
| Pilot (Main) | Thulasi Devi S · thulasi@tresconglobal.com · Marketing Director |
| Consulting | Shadi Dawi · shadi@tresconglobal.com · Group Director of PR & Strategic Partnerships |
| Tracking | Fouzan Abdul Rahim · fouzan@tresconglobal.com · Performance Marketing Lead |

**What it is:** A standalone section in EventPilot to manage all of Trescon's corporate marketing. Four components: (1) Corp website content management, (2) Corp deck management with version-controlled stats and approved assets, (3) Social content generation + calendar + publishing, (4) Articles. Objective: entire corp marketing managed within EventPilot with minimal supervision.

**Key open questions (Thulasi + Durga to decide):**
- [ ] Which component is Phase 1? (Social is recommended — reuses Content Hub patterns)
- [ ] Corp Deck: which fields need version control? Who approves changes?
- [ ] Which social channels are in scope for Phase 1?
- [ ] WordPress integration in Phase 1 or deferred?

**Next up (future phase, noted by Madhu):**
- Proposal Section — Thulasi to brief this separately once Corp Marketing Phase 1 is built

**Access:**
- Thulasi: `content`, `brand_studio` ✓
- Shadi: `content` ✓ (set 1 Jul 2026)
- Fouzan: `content` ✓ (set 1 Jul 2026)

---

### 3. Website Builder & Brand Studio Module

| Field | Detail |
|---|---|
| Status | Active — Pre-Build |
| Initiated | 2 Jul 2026 |
| Pilot (Main) | Khalifatur Rahman · khalifa@tresconglobal.com |
| Co-Pilot | Prashant Mual · prashant@tresconglobal.com |
| Consulting | Nicholas Nunes · nicholas@tresconglobal.com |
| Tracking | Fouzan Abdul Rahim · fouzan@tresconglobal.com |

**What it is:** A pilot project to decide how EventPilot's Website Builder and Brand Studio tools should be structured going forward — standalone hub vs. event-scoped, one unified module vs. two separate tools, and what starter templates/brand assets are needed. Scope has not been decided yet; Phase 1 is about aligning direction with Durga.

**Key open questions (Khalifa + Durga to decide):**
- [ ] One unified Website Builder + Brand Studio module, or two separate tools sharing infrastructure?
- [ ] Standalone hub outside the Events section, or stay scoped to individual events as today?
- [ ] Which tool gets Phase 1 focus — Website Builder, Brand Studio, or a shared foundation both need?
- [ ] Any scope overlap with the Bespoke Event Module's own website/brand needs (flagged by Nicholas)?

**Preliminary content needed (Khalifa + Prashant to prepare):**
- [ ] Starter template/section library for Website Builder
- [ ] Starter brand asset library for Brand Studio (logo variants, palettes, fonts)

**Access:**
- Khalifa: `website_builder` ✓, `brand_studio` ✓ (set 2 Jul 2026)
- Prashant: `website_builder` ✓, `brand_studio` ✓ (set 2 Jul 2026)
- Nicholas: `website_builder`, `bespoke` ✓ (already had access)

---

## How Pilot Projects Work

```
Madhu sets direction (email brief)
    │
    ▼
Pilot reads SME_CONTEXT.md → understands how to write prompts
    │
    ▼
Pilot + Durga align on Phase 1 scope (direct conversation)
    │
    ▼
Pilot writes PRD prompt using SME_CONTEXT.md template
    │
    ▼
Durga pastes prompt into Claude Code → code is written
    │
    ▼
Durga deploys → Pilot tests in live app
    │
    ▼
Pilot reports changes/bugs → Fouzan tracks → Durga fixes → repeat
    │
    ▼
Phase 1 complete → Pilot writes Phase 2 PRD
```

**Rules:**
- Architecture and scope questions go to **Durga**, not Madhu
- Madhu is available for **strategic direction** only — contact him offline if needed
- Fouzan escalates blockers to Durga, not Madhu
- All prompts must be written using SME_CONTEXT.md as context

---

## Adding a New Pilot Project

When a new Pilot Project is initiated:

1. Add it to this file with all fields filled
2. Run the seed script section for the new project in `scripts/seed-pilots.mjs`
3. The system will send assignment emails and create the in-app checklist automatically

---

*Last updated: 2 Jul 2026*
