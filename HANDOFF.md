# EventPilot — Session Handoff

> **Claude Code: Read this file at the start of EVERY session before doing any work.**
> Report its contents to the user when starting, so they know the current state.
> Update this file before every sign-off.

---

## Last Session

| Field | Value |
|---|---|
| Who | Madhu (last commit) · Durga (before that) · Claude Code (Opus 4.7) reconciled the handoff |
| Latest push | 2026-07-01 12:33 IST — Madhu (`8aaab2a`) |
| Handed off to | Durga / Open |
| Deployed | ✅ Yes — https://eventpilot.tresconglobal.com (Railway auto-deploy from main) |

**⚠️ Handoff note:** This file was last authored on 30 Jun 01:12 and captured only the 30 Jun morning session. Four commits shipped after that were never recorded in the handoff. They are captured below in the correct sessions. Sign-off protocol was skipped — please don't repeat the pattern.

---

## What Was Built — 01 Jul 2026 (Madhu)

### 🕐 12:31 IST · `3af08e9` — Pilot Projects (new feature, 1,625 lines, 10 files)

A new module for tracking SME-led micro-tool builds inside EventPilot. A "Pilot Project" is a scoped build where a subject-matter expert (the "Pilot") writes the PRD via SME_CONTEXT.md, Durga codes it, and Fouzan tracks status. Madhu sets direction, not day-to-day decisions.

**New surfaces:**
- `/pilots` — each Pilot sees their project role + personal tick-off checklist
- `/admin/pilots` — admin sees all projects, all members, full checklist grouped by person
- `PlatformMenu` updated — Pilot Projects section (visible to all), admin link to `/admin/pilots`

**New APIs:**
- `GET  /api/pilots` — role-aware (Pilot vs Admin returns different data)
- `PATCH /api/pilots/checklist/[id]` — tick checklist items
- `POST /api/admin/setup-pilots` — one-time seed of projects + sends assignment emails

**New database (Supabase migration):**
- `supabase/pilots_migration.sql` — three tables: `pilot_projects`, `pilot_project_members`, `pilot_checklist_items`

**New email hook:**
- `sendPilotAssignment()` added to `app/lib/email.ts`

**New docs (living):**
- `PILOTS.md` — master human-readable tracker for all Pilot Projects (currently: Bespoke Event Module + Corporate Marketing Module)
- `SME_CONTEXT.md` (461 lines) — the platform context SMEs paste into ChatGPT/Gemini before writing prompts for Durga

**Active Pilot Projects (from PILOTS.md):**
1. **Bespoke Event Module** — Pilot: Nicholas Nunes · Consulting: Thulasi · Tracking: Fouzan · Status: Active – Pre-Build. Purpose-built Bespoke event workflow inside the Events section (brand ingestion → landing page → outreach → content). 4 open scope questions with Nicholas + Durga; Nicholas is preparing 10 landing pages, 10 emailers, 2-3 Closely templates, 20 social posts.
2. **Corporate Marketing Module** — Pilot: Thulasi · Consulting: Shadi · Tracking: Fouzan · Status: Active – Pre-Build. Standalone corp marketing section (website / decks / social / articles). 4 open scope questions; Social is recommended as Phase 1 (reuses Content Hub patterns). Proposal Section noted as future phase.

### 🕐 12:33 IST · `8aaab2a` — setup-pilots DDL migration fix

`app/api/admin/setup-pilots/route.ts` (+60 lines). The `POST /api/admin/setup-pilots` seed endpoint now runs the DDL migration via `pg` **before** seeding — first attempt hit "table doesn't exist" against a fresh Supabase because the migration hadn't been applied yet.

---

## What Was Built — 30 Jun 2026 afternoon (Durga)

### 🕐 12:33 IST · `afc8367` — Messages fixes (`app/messages/page.tsx`, +16/−10)

Three bugs squashed:
1. **Staff search broken** — the `/api/staff-list` API returns an array at root; code expected a `d.staff` wrapper. `loadStaffList` now handles both formats. Same fix applied to `?with=` param lookup and the my-name fetch.
2. **Scroll-to-bottom fired on every messages-array change** — including initial load, stealing the user's read position. Now guarded with `prevMsgCountRef` so scroll only fires when count *increases* (new message), not on hydration.
3. **Inbox sort** — conversations now explicitly sorted by `last_time DESC` so newest thread is on top.

### 🕐 13:53 IST · `5027d9b` — Notification sound toggle + session fallback (`app/components/RealtimeNotifications.tsx`, +83/−27)

- Small speaker icon fixed at bottom-left of every page (persistent app-wide)
- Green speaker with waves = sound ON · grey with X = sound OFF
- Click opens menu: *Mute notifications* / *Unmute notifications*
- Preference persisted to `localStorage` (`ep_sound_enabled`)
- **Session fallback bundled in** — same root cause as the finance-page blank bug: cookie parse fails on some Microsoft SSO formats. Now falls back to `/api/auth/session` when cookie is unreadable.
- Sound still throttled to max 1 per 3 seconds

**Notable edge case flagged in the code:** super-admin can't subscribe to Supabase Realtime (no UUID). Real-time notifications are skipped for super-admin — worth revisiting if super-admin needs to see live events.

---

## What Was Built — 30 Jun 2026 morning (Durga)

Continued from 29 Jun late-night session.

### 1. Recruitment — Sample Data + UI Fix

- Sample recruitment data (2 jobs, 8 candidates):
  - Senior Event Producer (Dubai, AED 8,000-12,000) — 6 candidates across pipeline stages (applied → offer)
  - Digital Marketing Executive (Bangalore, INR 40,000-60,000) — 2 candidates
  - Each has AI score, strengths/gaps, interview rounds with 5-point ratings (communication, technical, culture, problem-solving)
- Kanban UI fixes:
  - Empty columns collapse to 100px (was 240px)
  - Active columns expand with flex
  - Candidate cards have avatar initials
  - Yellow "Sample Data" banner on demo positions
  - Collapsible JD section

### 2. HR Portal Dashboard Polish

- Nav links: SVG icons + hover states (Attendance, Recruitment, Staff, Performance, Leave, Onboarding)
- Stat cards: alerts glow accent + pulsing dot when count > 0; zero values muted grey
- Empty states: compact inline with small check icon (was huge centered blocks)
- Init banner: slim compact bar (was full-width card)

### 3. Finance Pages — Empty State Tables + Currency

All finance pages show table structure even when empty:
- **Expenses:** headers (Staff, Category, Description, Event, Amount, Date, Status) + 40% opacity sample row
- **Vendors:** headers (Vendor, Category, Event, Invoice, Amount, Due Date, Status, Actions) + sample row
- **Payroll:** department/staff toggle + headers + sample row with realistic figures
- **Salary:** 4-column breakdown card + sample format guide

Salary multi-currency:
- Auto-detects from staff office: Dubai → AED, India offices → INR
- Shows USD equivalent on salary card, history table, form preview
- Rates: AED→USD 0.2723, INR→USD 0.01189
- Office context strip: "Office: Dubai | Currency: AED | USD equivalent: $ X.XX"

### 4. Bug Fixes

**Finance pages blank (CRITICAL):**
- `/api/hr/staff` had NO GET handler — only POST. Salary page never loaded staff list.
- Added GET → returns all active staff with id, name, email, department, role, job_level, office_id
- Client-side session cookie not readable (Microsoft SSO format mismatch) — added API fallback (this pattern was reused on 30 Jun afternoon in RealtimeNotifications.tsx)
- Changed `if (!session) return null` to show loading state (was blank page)

---

## Known Issues (not yet fixed)

1. **Finance pages may still show blank** — session-cookie client-side parse issue. API fallback added twice now (finance pages + RealtimeNotifications) but may not be applied universally. Needs a shared session-reader utility or systemic fix. Test after next deploy.
2. **Platform Updates ("What's Next")** shows static dev build-log entries — it's a dev changelog, not a user-facing update feed. Needs redesign.
3. **Payroll grades** (L1-EX) are default placeholders — need Trescon's actual grade structure from HR/Madhu.
4. **`middleware.ts` deprecation warning (Next.js 16)** — the "middleware" file convention is deprecated and should be renamed to `proxy`. Non-blocking today but scheduled for removal in a future Next.js. See: https://nextjs.org/docs/messages/middleware-to-proxy
5. **Super-admin Realtime blackout** — RealtimeNotifications.tsx deliberately skips Supabase Realtime for super-admin (no UUID to subscribe with). If Madhu needs live notifications, needs a workaround.

---

## What's Next

### Pending — waiting for Madhu

1. **HRMS Supabase access** — old project `smdqljhuwcnfhzezrlbg` not in Trescon org. Need dashboard access or Realtime publication on `attendance_records` table.
2. **Canva env vars** — `CANVA_CLIENT_ID` + `CANVA_CLIENT_SECRET` on Railway.
3. **HR Attendance & Payroll plan** — saved in memory (`project_hr_attendance_plan.md`):
   - Holiday calendar per office (Dubai vs India)
   - LOP auto-calculation
   - Attendance percentage
   - Multi-currency payroll (INR India, AED Dubai, USD P&L)
   - Monthly attendance summary reports
   - Regularisation requests, comp-off, leave encashment
4. **Payroll grades** — confirm Trescon's actual grade structure (L1-EX are defaults).

### Pending — active Pilot Projects (SME-led)

5. **Bespoke Event Module (Nicholas)** — 4 scope decisions with Nicholas + Durga; Nicholas gathering 10 landing pages, 10 emailers, 2-3 Closely templates, 20 social posts. Waiting on Phase 1 scope lock.
6. **Corporate Marketing Module (Thulasi)** — 4 scope decisions with Thulasi + Durga; Social recommended as Phase 1. Waiting on Phase 1 scope lock.

### Pending — can build anytime

7. **Finance page blank fix** — deeper investigation on session-cookie format; consider consolidating to a shared session-reader utility.
8. **Platform Updates redesign** — change from dev build log to actual user-facing changelog.
9. **Recruitment JD builder** — AI-assisted job description creation, publishable to platforms.
10. **Overall UI/UX audit** — Durga flagged HR portal, Recruitment, Finance as amateur-looking. Multiple pages need polish.
11. **Migrate `middleware.ts` → `proxy.ts`** — Next.js 16 deprecation. Small, mechanical migration.

---

## Key Decisions Made This Session (30 Jun + 01 Jul)

- India salary in INR, Dubai salary in AED — USD equivalent shown everywhere for P&L
- Exchange rates: AED 0.2723, INR 0.01189 (approximate, hardcoded for now)
- Payroll grades L1-EX are placeholders — to be confirmed with Trescon HR
- Finance pages should always show table structure with headers + sample row even when empty
- Sample recruitment data created for demo — marked with yellow "Sample Data" banner
- **Pilot Projects model established (Madhu, 01 Jul):** SME owns PRD, Durga builds, Fouzan tracks, Madhu sets direction only. All prompts must be written using SME_CONTEXT.md as context.
- **Session-fallback pattern established:** when `tcs_session` cookie parse fails client-side, fall back to `/api/auth/session`. Used in finance pages + RealtimeNotifications. Should be extracted to a shared utility.

---

## Previous Sessions

- **30 Jun 2026 — Durga (afternoon)** — Messages fixes (staff search, scroll behaviour, inbox sort); Notification sound toggle + session fallback in RealtimeNotifications
- **30 Jun 2026 — Durga (morning)** — Recruitment sample data + Kanban UI, HR Portal dashboard polish, Finance empty-state tables, Salary multi-currency, CRITICAL fixes (`/api/hr/staff` GET + session cookie fallback)
- **29 Jun 2026 — Durga (major session)** — Timesheets, Salary, Performance Reviews, Expense Claims, Vendor Payments, Payroll Summary, Finance Portal, Event Intelligence Brief, real-time notifications (Supabase Realtime + sound + browser push), 5-minute attendance sync. Restructured: Toolkit (6 categories, 14 tools, dark sidebar, collapsible dropdowns), Admin nav bar, Finance/HR separation, Event workspace RACI flow. Fixed: PDF extraction, TypeScript build blocker.
- **28 Jun 2026 — Durga** — Bespoke Tracker full build (3 tables, 3 APIs, 3 pages, 53 auto-generated tasks)
- **26 Jun 2026 — Durga** — Content Engine upgrades, Messaging restored, Dashboard layout fixes, Commercial P&L crash fix
- **25 Jun 2026 — Durga** — Commercial Tracker full BRD implementation (8 tables, 15 APIs, Executive Dashboard + Event Workspace)

---

*This handoff was reconciled by Claude Code (Opus 4.7) on 2026-07-01 after finding four unrecorded commits. Verified locally on port 3003: `/pilots`, `/admin/pilots`, `/api/pilots` all compile cleanly and redirect to `/login?next=…` (auth wall working as designed). Local main is synced with `origin/main` at `8aaab2a`.*
