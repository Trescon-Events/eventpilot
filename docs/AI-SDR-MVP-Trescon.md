# Trescon AI-SDR — MVP Product Requirements Document

**Owner:** Durga Charan
**Status:** Draft v1 · 2026-07-28
**Home:** New EventPilot module at `/admin/toolkit/lead-response`

---

## 1. Executive Summary

Trescon spends real money on Meta / Google / TikTok / LinkedIn ads to generate delegate leads for its bespoke boardroom, summit, and webinar events. The response window on a fresh paid lead is small — industry data (Harvard Business Review, InsideSales.com) shows **conversion drops ~10× when a lead isn't contacted within 5 minutes**. Trescon today responds through a manual delegate-team workflow that averages hours-to-days, not seconds.

This document proposes an **AI-Sales-Development-Representative (AI-SDR)** module inside EventPilot that:

1. **Answers every inbound call** to a dedicated Trescon number within one ring, using a natural-sounding AI voice (English + Arabic).
2. **Qualifies the lead through conversation** using the same criteria the Trescon delegate team applies today.
3. **Books the qualified caller** into a real Google Calendar slot before the call ends.
4. **Writes the record** to Supabase (EventPilot lead source of truth) *and* syncs to Trescon's HubSpot pipeline.
5. **Escalates gracefully** — voicemail with a promise-to-call-back within a stated SLA when the AI can't handle it, or when the caller explicitly asks for a human.
6. **Chases no-shows and dead leads** via WhatsApp + email once Phase 2 lands.

This is the same product category as ConvoFlow (ae), Air.ai, Regal.io, and Ada — but built inside EventPilot, using Trescon's own qualification logic, and priced at ~10% of what those platforms charge Trescon-scale customers.

---

## 2. Trescon Business Context

### 2.1 Where leads come from today

- **Meta / Google / TikTok / LinkedIn ad campaigns** — click on ad → landing page form (built in EventPilot Website Builder) → lead lands in `leads` table
- **Website organic contact form** — same table
- **Referrals + inbound phone** — currently no structured capture; delegate team handles manually
- **Client wishlists** — imported CSV/XLSX per event (already handled by Bespoke Tracker's bulk import — Nic's 17 Jul feature)

### 2.2 What the delegate team does with each lead today

Roughly, per the existing EventPilot bespoke SOP (43-task template, Nic 2f002c2e):

1. Review the lead's wishlist against ICP parameters (title, industry, geography)
2. Enrich contact details (LinkedIn, phone, email verification)
3. Reach out (call, email, LinkedIn message)
4. Qualify against event criteria (seniority, seat authority, buying intent)
5. Register the qualified lead
6. Send calendar invite + confirmation
7. Reminder call/email 24–48 hours before event
8. Manage day-of check-in

Steps 3–6 are the SDR loop. That's what the AI takes over.

### 2.3 The specific pain points AI-SDR fixes

| Pain today | What AI-SDR does |
|---|---|
| Leads sit uncontacted for 4–48 hours | AI picks up on the first ring, 24/7 |
| Inconsistent qualification — team members use different questions | Same LLM-driven script for every call, tuned to Trescon's ICP |
| No structured record of *why* a lead was disqualified | Every call recorded, transcribed, scored, stored |
| Follow-ups get missed on high-volume campaigns | Automatic drip after any missed connection |
| No visibility into funnel until end-of-event | Live dashboard: Leads → Contacted → Qualified → Booked → Showed → Revenue |
| HubSpot pipeline lags reality | Two-way sync fires on every state change |

### 2.4 What "success" looks like for the pilot

Measurable outcomes over the first four weeks post-Phase-1:

- **Response time:** median lead-to-first-contact < 60 seconds (from current ~hours)
- **Contact rate:** ≥ 70% of new leads reached on first attempt (from current ~30%)
- **Qualification rate:** ≥ 40% of contacted leads scored qualified (baseline the delegate team's rate first, then match/beat)
- **Booking rate:** ≥ 25% of qualified leads book a calendar slot during the call
- **Show rate:** ≥ 60% of booked calls actually show up (industry AI-SDR benchmark)
- **Delegate team productivity:** existing delegate team spends 40% less time on qualification, moves that time to high-value account development

---

## 3. Scope — MVP Phase 1

### 3.1 In scope

- Inbound AI voice calls on **one dedicated Trescon number** (dummy number for dev, live Trescon number at production cut-over)
- **English + Arabic** conversation, with language handling to be finalised (see §7.5)
- Real-time qualification through LLM-driven conversation
- Real Google Calendar booking (open shared calendar or team round-robin)
- Real HubSpot contact + deal creation on qualified booking
- Voicemail escalation with SLA promise
- Full call recording + transcript + qualification score, viewable in EventPilot admin
- Admin dashboard: live active calls, funnel counts, transcript search, recording playback
- Rate up to 100 calls/day (Phase 1 target)

### 3.2 Explicitly out of scope for Phase 1

- Outbound AI-initiated calls (Phase 2)
- WhatsApp two-way conversation (Phase 2 — Phase 1 only uses WhatsApp for post-call confirmation)
- Dead-lead revival campaigns (Phase 3)
- HubSpot two-way sync (Phase 3 — Phase 1 is one-way EventPilot → HubSpot)
- Scale to 5,000 calls/day (Phase 4)
- Voice cloning of a specific Trescon spokesperson (nice-to-have, not required for MVP)
- Multi-tenant (running the same infra for a Trescon client) — separate business decision

### 3.3 Success gates before we move to Phase 2

- Ten real leads, real callers, real Trescon delegate team observing → the delegate team lead signs off that qualification quality matches their standard
- Live for 5 consecutive business days at 100% uptime
- Zero PII leaks (all transcripts stored in Trescon's Supabase, no third-party retains audio beyond 24 hours)
- HubSpot sync accuracy ≥ 99% (measured against manual audit of 50 sample leads)

---

## 4. User Flows

### 4.1 Inbound qualified call — the golden path

```
Caller dials Trescon inbound number
        │
        ▼
Twilio inbound webhook fires within ~50ms
        │
        ▼
Vapi assumes the media stream
        │
        ▼
AI greets in caller's inferred language (auto-detect or IVR — see §7.5):
"Thank you for calling Trescon. I can help you with delegate registration
 for our upcoming boardrooms and summits. May I know your name and the
 company you're calling from?"
        │
        ▼
AI runs qualification script (Trescon ICP: seniority, region, industry,
  intent, event of interest, budget authority) — max 6–8 turns
        │
        ▼
If QUALIFIED:
   AI calls tool `check_calendar(next_5_business_days)`
   AI proposes 3 slots
   Caller picks one
   AI calls tool `book_slot(slot, name, phone, email)`
   AI calls tool `save_lead(...)` → EventPilot Supabase
   AI calls tool `sync_to_hubspot(lead)` → HubSpot contact + deal
   AI calls tool `send_confirmation('whatsapp', message)`
        │
        ▼
AI closes: "You're confirmed. You'll receive a WhatsApp confirmation now
 and a calendar invite in the next minute. Have a great day."
        │
        ▼
Call ends. Post-call webhook stores transcript, recording, score, artifacts.
```

### 4.2 Inbound low-quality lead

Same up to qualification. If DISQUALIFIED (wrong seniority / off-ICP / not decision maker):

- AI politely wraps: *"Based on what you've shared, our upcoming events aren't the right fit — but we'll add you to our newsletter for future opportunities that match."*
- AI calls `save_lead(status='disqualified', reason='...')` → EventPilot Supabase (no HubSpot sync)
- No calendar booking, no follow-up drip

### 4.3 Inbound unclear / needs human

If caller asks for a specific delegate team member, has a complex question the AI cannot handle confidently, or the AI's confidence score drops below threshold three consecutive turns:

- AI: *"I'll get one of our delegate specialists to call you back within one business hour. Can I confirm the best number to reach you on?"*
- AI captures number + reason
- Ticket created in EventPilot for the delegate team
- Voicemail promise honoured — dashboard shows escalations that are approaching SLA breach

### 4.4 After hours

- AI can answer 24/7 — no after-hours gap
- If caller specifically asks for a callback during business hours, AI captures preferred time + syncs to a callback queue in the dashboard

### 4.5 Post-call automation (Phase 1 only)

- WhatsApp confirmation with meeting details (Meta Cloud API template message)
- Email confirmation with calendar `.ics` attachment (Resend, already in stack)
- SMS fallback if WhatsApp fails (Twilio Messaging)
- 24-hour and 2-hour reminders before the booked meeting (all three channels)

### 4.6 Admin dashboard views

Six views in `/admin/toolkit/lead-response`:

1. **Live** — active calls right now (concurrent), each with real-time transcript + take-over button
2. **Funnel** — today / this week / this month: Leads → Contacted → Qualified → Booked → Showed → Revenue attributed
3. **Calls** — searchable list; filter by outcome, agent version, language, time-of-day
4. **Call detail** — full transcript, recording playback, tools called, qualification score breakdown
5. **Escalations** — voicemail promises pending; sorted by SLA-remaining
6. **Configuration** — system prompt, ICP criteria, calendar targets, HubSpot mapping, WhatsApp templates

---

## 5. Recommended Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Trescon inbound phone number                        │
│                    (dummy for dev — real at cut-over)                  │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │  SIP
                     ┌────────────▼────────────┐
                     │       Twilio Voice      │
                     └────────────┬────────────┘
                                  │  webhook: TwiML → Vapi
                     ┌────────────▼────────────┐
                     │  Vapi (voice AI OS)     │
                     │   · Deepgram Nova-2 STT │
                     │   · Claude Sonnet 4.6   │
                     │   · ElevenLabs TTS      │
                     └────────────┬────────────┘
                                  │  tool calls (HTTPS)
       ┌──────────┬──────┬────────┼────────┬───────────────┬────────────┐
       ▼          ▼      ▼        ▼        ▼               ▼            ▼
 check_        book_ save_lead sync_to_ send_        escalate_    end_call
 calendar      slot  (Supabase)hubspot  confirmation to_voicemail (post-call
 (Google Cal   (Google         (HubSpot (Meta WhatsApp+                webhook)
  API v3)      Cal API)         Contacts Twilio SMS +
                                 API)    Resend email)
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       EventPilot admin      HubSpot pipeline    Caller's phone
       dashboard (Next.js    (contact + deal,    (confirmation on
        + Supabase)          Trescon portal)      three channels)
```

---

## 6. Tool Comparison — Layer by Layer

Every layer of the stack has 2–5 credible options. Below is what we picked and why. Every table is 2026 pricing and features unless noted.

### 6.1 Voice AI Orchestrator (the layer that runs the live call)

| Platform | Per-min cost | Latency | Concurrency | Compliance | Multilingual | Verdict |
|---|---|---|---|---|---|---|
| **Vapi** ✅ | $0.05 platform + BYO STT/LLM/TTS ≈ **$0.09–0.13/min bundled** | 500–600ms | 10 free, then $10/line/mo | SOC2, HIPAA opt-in, PCI, SSO, RBAC (Scale tier) | Yes, provider-dependent | **PICKED** — cheapest, most flexible, BYO everything |
| Retell AI | $0.055 platform + bundled STT/LLM/TTS ≈ **$0.07–0.31/min** | 580–620ms | 20 free, then $8/mo/concurrent | SOC2, HIPAA (enterprise) | Yes | Runner-up. Better defaults but $0.02/min more expensive at scale. Fine if we want turnkey. |
| Bland AI | All-in **$0.11–0.14/min** | ~800ms | 10 (Start) → 100 (Scale) | HIPAA, SOC2, GDPR, PCI | Not explicitly Arabic | Higher latency; better for outbound blasts than inbound |
| Synthflow | $0.08/min + $30k/yr enterprise | ~600ms | Included in plan | SOC2, GDPR | Yes | No-code focused — we don't need that. Pass. |
| PolyAI | Custom enterprise pricing (~$50–200k/yr) | ~500ms | Unlimited | SOC2, ISO 27001, HIPAA, PCI | **Strong Arabic + Gulf dialects** | Enterprise-only. Overkill for MVP. Revisit at Phase 4 if we hit compliance friction. |
| Air.ai | Rumoured $100/mo + per-min | Similar | Included | Enterprise | Yes | Product+sales heavy; less transparent pricing. Pass. |

**Winner: Vapi**. Cheapest for our profile, engineer-controlled, best price at scale. If Vapi ever becomes a bottleneck (unlikely), we can swap to Retell without rewriting our tool endpoints — the tool contract stays the same.

### 6.2 Speech-to-Text (STT)

| Provider | Cost | Accuracy (EN) | Accuracy (Arabic) | Latency | Verdict |
|---|---|---|---|---|---|
| **Deepgram Nova-2** ✅ | $0.0043/min streaming | 92% | 82–85% MSA, lower Gulf | 240ms P50 | **PICKED** — best price/latency/language combo |
| OpenAI Whisper (via Groq) | $0.006/min | 93% | 88% | 300ms | Slightly better Arabic; higher cost |
| Google Speech-to-Text | $0.006/min | 91% | 85% | 400ms | Higher latency |
| Azure Speech | $0.006/min | 91% | 85% MSA | 350ms | Slightly better Gulf dialect; enterprise contract friction |

**Winner: Deepgram**. If Arabic Gulf-dialect accuracy proves a problem in testing, swap to Azure Speech for Arabic-only calls (Vapi supports per-language STT routing).

### 6.3 LLM (the conversation brain)

| Model | Cost/1M tok in/out | Latency | Arabic fluency | Tool-calling reliability | Verdict |
|---|---|---|---|---|---|
| **Claude Sonnet 4.6** ✅ | $3 / $15 | ~800ms first token | Native, very good | Best-in-class | **PICKED** — most reliable tool-calling, natural Arabic |
| Claude Opus 4.7 | $15 / $75 | 1200ms | Native, excellent | Best-in-class | Overkill for MVP. Reserve for escalations that need reasoning. |
| GPT-4.1 (Q3 2026) | $2.50 / $10 | 900ms | Native, good | Very good | Solid alternative; edge to Claude on tool discipline |
| Gemini 2.5 Flash | $0.30 / $2.50 | 400ms | Native, good | Improving | Cheapest, fastest — worth A/B testing at Phase 2 for the high-volume outbound |
| Llama 3.3 via Groq | $0.79 / $0.99 | 200ms | Fair | OK | Very fast but Arabic weaker; not worth Phase-1 complexity |

**Winner: Claude Sonnet 4.6**. Trescon already has Anthropic API access via Jettifi/EventPilot infrastructure. Same key, same billing.

### 6.4 Text-to-Speech (TTS)

| Provider | Cost | Voice quality | Arabic voices | Latency | Verdict |
|---|---|---|---|---|---|
| **ElevenLabs** ✅ | $0.15/1K chars ($990/mo Business tier) | Best-in-class | Excellent — 4 Arabic voices, 2 Gulf-dialect | 400ms streaming | **PICKED** — industry leader, real Arabic voices |
| Cartesia | $0.05/1K chars | Excellent, very natural | Adding Arabic Q4 2026 | 150ms — fastest | Latency king. Revisit Q4 2026 for Arabic. |
| PlayHT | $0.20/1K chars | Very good | 3 Arabic voices | 600ms | Similar to ElevenLabs but pricier |
| OpenAI TTS | $15/1M chars ≈ $0.015/1K chars | Good | Yes but limited | 500ms | Cheapest brand-name option; less premium |

**Winner: ElevenLabs**. Business tier ($990/mo) covers ~6M characters, which is roughly 6,000 minutes of speech — comfortable at 100 calls/day × 5 min = 500 min/day = 15,000 min/month. Cost above tier is $0.15/1K chars.

### 6.5 Telephony

| Provider | Inbound cost/min | Number cost/mo | Coverage | API quality | Verdict |
|---|---|---|---|---|---|
| **Twilio** ✅ | $0.0085 US / $0.014 UAE / $0.011 India | $1–15 | Global | Best documented | **PICKED** — Vapi's default, best-in-class dev tooling |
| Telnyx | $0.0035–0.007 | $1–10 | Global | Very good | Cheaper but less mature integrations |
| Vonage | $0.008 | $2 | Global | OK | Nothing special |
| Bandwidth | $0.0044 | $0.35 US | US-centric | Enterprise | US-heavy, weak GCC coverage |

**Winner: Twilio**. Slight premium over Telnyx is worth the tighter Vapi integration + universal support. If UAE/India per-minute cost becomes material at 5,000 calls/day, revisit Telnyx.

### 6.6 WhatsApp Business

| Provider | Cost | Volume limits | Setup effort | Verdict |
|---|---|---|---|---|
| **Meta WhatsApp Cloud API (direct)** ✅ | Per-message: utility ~$0.005, marketing ~$0.02 (UAE), free within 24h service window | Unlimited once verified | 5–7 days verification | **PICKED** — no BSP margin, direct control |
| Twilio WhatsApp | +$0.005/message margin over Meta | Same | 1–2 days | Faster to start but permanent per-message tax |
| Gupshup | Various tiers | Same | 3–5 days | Indian BSP; good for scale in India |
| WATI | $50–200/mo | Same | 1 day | Small-business tool; UI-heavy, less API control |

**Winner: Meta Cloud API direct**. Trescon should own the WhatsApp Business account. Twilio WhatsApp is fine for the first 1–2 weeks if verification is slow, then migrate to direct.

### 6.7 CRM

| CRM | Trescon has it? | API quality | Cost | Verdict |
|---|---|---|---|---|
| **HubSpot** ✅ | Yes | Excellent, well-documented | Existing seat | **PICKED — required** |
| Salesforce | No | Excellent | $$$ | N/A |
| Pipedrive | No | Good | $$ | N/A |

**Winner: HubSpot** — non-negotiable, Trescon already runs it.

### 6.8 Calendar

| Provider | Cost | API quality | Round-robin support | Verdict |
|---|---|---|---|---|
| **Google Calendar API** ✅ | Free | Excellent | Manual | **PICKED** — Trescon already runs Google Workspace |
| Cal.com (self-hosted) | Free / $12 per user | Good | Yes native | Add-on complexity we don't need for MVP |
| Calendly API | $12/user/mo | Good | Yes native | We'd be paying twice — Google + Calendly |
| Chili Piper | $30+/user/mo | Excellent | Yes native | Enterprise-priced, overkill |

**Winner: Google Calendar direct**. Use one shared calendar `ai-sdr-bookings@tresconglobal.com` (create as a Google Workspace shared calendar). If Phase 2 needs round-robin across a team, layer Cal.com in front of Google.

### 6.9 Email

Already in stack: **Resend** (used for EventPilot notifications).

### 6.10 Runtime / hosting

Already in stack: **Railway** (EventPilot's home). No change.

---

## 7. Detailed Design Decisions

### 7.1 Language handling (English + Arabic)

Three viable models — I recommend (a) with (b) as fallback if auto-detect misfires:

- **(a) Auto-detect** — AI opens with a bilingual greeting, listens to the caller's first sentence, and locks the conversation to that language for the rest of the call. Cleanest UX.
- **(b) IVR menu** — "Press 1 for English, 2 for Arabic." Fastest to build, feels dated.
- **(c) Two numbers** — separate DID per language. Simpler back-end, harder marketing.

**Decision:** start with (a). If auto-detect confusion exceeds 5% of calls in the first week, fall back to (b).

### 7.2 The AI's system prompt (qualification script)

Draft — needs Trescon delegate team review before we set it in production:

```
You are Trescon's delegate onboarding assistant. Your job is to:
  1. Greet the caller professionally in the language they use.
  2. Confirm their name, company, job title, and the event they're
     calling about.
  3. Qualify them against Trescon's ICP:
       — Seniority: C-level, VP, Director, Senior Manager
       — Function relevance to the event topic
       — Region matches event geography
       — Budget or influence to attend/sponsor
       — Genuine intent (not a competitor, not a vendor pitch)
  4. If qualified, book them into an available calendar slot within
     the next 5 business days.
  5. If unclear or the caller asks for a human, escalate politely.

Rules:
  — Never fabricate event details, dates, or client names.
  — Never quote pricing — say "our commercial team will share
    pricing after this call."
  — Always confirm the caller's spelling of name + company before
    booking.
  — Never keep the caller on hold longer than 5 seconds.
  — If asked "are you a robot" — be honest: "I'm Trescon's AI
    assistant. A human will follow up after this call."
```

### 7.3 Voicemail escalation SLA

**Decision needed from Durga.** Standard options:
- "Within 1 business hour" — commits delegate team to fast turnaround, best conversion
- "Within 4 business hours" — safer for team, still competitive
- "Within one business day" — safe but weak signal

Recommendation: **1 business hour** for booked/qualified escalations, **4 business hours** for general enquiries. Configurable per escalation reason.

### 7.4 Calendar model — dedicated calendar vs. round-robin team

Phase 1 uses a **single dedicated Google Calendar** (`ai-sdr-bookings@tresconglobal.com`). Any Trescon team member added to that calendar sees the bookings.

Phase 2 upgrade path: if the delegate team wants per-person routing (Charan owns UAE-region bookings, someone else owns India, etc.), we add rules or layer Cal.com on top.

### 7.5 HubSpot mapping

New EventPilot leads land in HubSpot as:

- **Contact** — name, phone, email, company, seniority tags, source = "AI-SDR Trescon"
- **Deal** — event of interest, calendar slot, qualification score, transcript URL, recording URL
- **Pipeline** — new pipeline `AI-Qualified Inbound` (or existing "Delegate Pipeline" if Trescon prefers)
- **Custom properties** — mapped from EventPilot's ICP criteria (industry, geography, seat authority, buying intent)

One-way sync in Phase 1 (EventPilot → HubSpot). Two-way in Phase 3.

### 7.6 Recordings + PII + compliance

- Every call is recorded — legally required disclosure on the AI's opening ("This call is being recorded for quality").
- Recordings stored in Supabase Storage (private bucket, signed URLs, 90-day retention).
- Vapi's Zero-Data-Retention add-on ($1000/mo) buys us Vapi never storing audio — needed if we handle EU callers under GDPR.
- Transcripts store PII (name, phone, email, company) — access-gated to the delegate team + admin roles.
- Right-to-erasure: dashboard "delete lead" action wipes transcript + recording + HubSpot contact.

---

## 8. Cost Model

### 8.1 Per-call unit economics

Assumes 3-minute average call, English:

| Component | Cost |
|---|---|
| Twilio inbound | $0.014 × 3 = $0.042 |
| Vapi platform | $0.05 × 3 = $0.15 |
| Deepgram STT | $0.0043 × 3 = $0.013 |
| Claude Sonnet 4.6 (~2000 tokens per turn × 6 turns) | ~$0.09 |
| ElevenLabs TTS (~500 chars per turn × 6 turns) | ~$0.045 |
| WhatsApp confirmation template | $0.005 |
| **Total per call** | **~$0.35** |

### 8.2 Monthly cost scenarios

| Volume | Calls/day | Total calls/mo | AI cost/mo | HubSpot | Total |
|---|---|---|---|---|---|
| Phase 1 pilot | 100 | 3,000 | $1,050 | existing | ~$1,050 |
| Phase 2 growth | 500 | 15,000 | $5,250 | existing | ~$5,250 |
| Phase 3 scale | 2,000 | 60,000 | $21,000 | existing | ~$21,000 |
| Phase 4 max | 5,000 | 150,000 | $52,500 | existing | ~$52,500 |

**Comparison — what ConvoFlow / Regal / Air.ai charge Trescon-scale customers:** typically $10k–50k/month base fee + per-conversation surcharge. **Our build:** just usage cost with 40–70% margin vs buying it.

### 8.3 One-time build cost

Zero external spend — this is engineering time, absorbed in existing Claude Code / Durga time. No new SaaS subscriptions until go-live.

---

## 9. Compliance

- **UAE (TDRA)** — inbound calls require recording disclosure at start. Handled.
- **India (TRAI)** — DND registry check for any outbound calls (Phase 2+). Handled.
- **EU / GDPR** — right to erasure, data residency EU-only if EU callers. Vapi supports EU region + Zero-Data-Retention add-on. Deferred until we see actual EU volume.
- **DIFC Data Protection Law No. 5 of 2020** — Trescon's ICL entity is DIFC-registered. Consent + purpose limitation captured in the AI opening.
- **HubSpot data** — Trescon is the data controller. AI-SDR is a processor with a Data Processing Agreement (already in place under Trescon's Anthropic + Vapi contracts).

---

## 10. Timeline

| Phase | Weeks | Milestones | Gating decisions from Durga |
|---|:---:|---|---|
| **Phase 1 — MVP** | Week 1–2 | Scaffolded module + 6 tool endpoints + Vapi config + English system prompt + one dummy calendar + one dummy HubSpot portal; end-to-end demo with test callers | HubSpot API key, real calendar Gmail, real carrier for Trescon number |
| **Phase 2 — Live + multi-channel** | Week 3–4 | Live on real Trescon number, real HubSpot, dashboard shipped, WhatsApp confirmation live, Arabic prompt tested with 20 real Trescon-team-simulated calls | Sign-off from delegate team lead on qualification script accuracy |
| **Phase 3 — Two-way sync + dead lead revival** | Week 5–6 | HubSpot two-way sync (state changes flow back), dead lead re-engagement drip campaigns (WhatsApp + email), delegate team training | Trescon dead lead list export |
| **Phase 4 — Scale** | Week 7+ | Concurrency provisioning for 5000/day, Meta Business verification, Arabic auto-detect A/B test complete, Vapi Zero-Data-Retention if EU callers appear | Go/no-go decision on marketing spend increase |

**Phase 1 goes live in 5–7 working days from Durga's `go`**, minus any external dependency delays (Vapi signup, HubSpot key rotation).

---

## 11. Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Arabic STT accuracy too low (Gulf dialect) | Medium | Blocks Arabic launch | Test 50 real calls in dev; swap to Azure Speech for Arabic-only route if Deepgram fails |
| Callers reject speaking to an AI | Low–Medium | Reduces conversion | Human-first opening; instant escalation on request; "would you prefer a callback from a human?" branch |
| Vapi outage during live event marketing push | Low | Missed leads during outage | Twilio fallback: forward straight to delegate team ring group when Vapi health check fails |
| HubSpot API rate limits at scale | Medium | Sync lag | Queue writes, batch every 60s at scale; upgrade to HubSpot Ops Hub if it becomes a bottleneck |
| Cost overrun at high volume | Low | Budget risk | Real-time cost dashboard; per-day spend cap with alert; auto-throttle when cap reached |
| PII in transcript leaks | Low | Compliance breach | Redact phone/email in stored transcript; encrypt recording bucket; RBAC on dashboard |
| Meta WhatsApp verification delays | High | Delays Phase 2 | Start verification in Phase 1 in parallel |
| Trescon delegate team resists automation | Medium | Adoption failure | Involve delegate team lead in script review from day 1; frame as team augmentation not replacement |

---

## 12. Open Items — Need Durga's Input

None of these block Phase 1 kickoff. Each is needed by the point noted.

1. **Vapi vs Retell final call** — recommend Vapi. Needed by day 3.
2. **Carrier of the dedicated Trescon number** — Twilio or another? Needed at Phase 1 live cut-over (~day 7).
3. **Booking calendar Gmail address** — create `ai-sdr-bookings@tresconglobal.com` or use existing? Needed by day 5.
4. **HubSpot portal ID + private-app access token** — needed by day 6.
5. **Voicemail SLA text** — recommend "within 1 business hour". Needed by day 5.
6. **Language handling model** — recommend auto-detect. Needed by day 4.
7. **Qualification script sign-off** — delegate team lead reviews §7.2 draft. Needed before Phase 2 live.
8. **Recording disclosure legal review** — one-sentence disclosure at call open. Needed before Phase 2 live.

---

## 13. Success Metrics — KPIs

Track weekly in the admin dashboard, review with Durga + Trescon delegate team lead every Monday:

- **Response time median** (target: < 60s)
- **Contact rate** (target: ≥ 70%)
- **Qualification rate** (target: ≥ 40%)
- **Booking rate** (target: ≥ 25% of qualified)
- **Show rate** (target: ≥ 60% of booked)
- **Cost per qualified lead** (target: < $2)
- **Cost per booked meeting** (target: < $10)
- **Delegate team hours saved per week** (target: ≥ 20)
- **CSAT** — post-call 1-question SMS "Was this call helpful? Y/N" (target: ≥ 80% Y)
- **Escalation SLA compliance** (target: ≥ 95% within promised window)

---

## 14. Appendix — Direct Comparison to ConvoFlow

| Dimension | ConvoFlow.ae | This build |
|---|---|---|
| Ownership | Third-party SaaS | Trescon-owned, in EventPilot |
| Data | Sits in ConvoFlow's cloud | Trescon Supabase + HubSpot only |
| Pricing at 5,000 calls/day | Est. $15–40k/mo | ~$52k/mo pure usage, no SaaS margin |
| Customisation | Vendor roadmap | Ship any change in a git push |
| Integration with EventPilot's existing lead/event/delegate schema | Custom middleware needed | Native — same DB |
| Arabic support | Marketing pages available; product quality unverified | Deep — ElevenLabs Arabic + Claude native + Deepgram/Azure switchable |
| Compliance (DIFC, TDRA) | Vendor's responsibility | Trescon controls |
| Trescon-specific qualification logic | Hard to enforce via generic vendor UI | Codified in git, reviewed and versioned |

**Verdict:** ConvoFlow-quality product, at ~40% of ConvoFlow cost at scale, fully owned by Trescon, deeply integrated with the existing EventPilot stack.

---

## 15. What Happens Next

Say `go` on this PRD and Phase 1 kickoff work begins:

- Day 1–2: Scaffold module, tables, 6 tool endpoints, English system prompt
- Day 3–4: Vapi assistant config, live dev demo answering test calls
- Day 5–7: Dashboard, admin views, WhatsApp confirmation, cut-over to real Trescon number

Total: 5–7 working days to a fully-working Phase 1 demo.

---
