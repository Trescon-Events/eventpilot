# EventPilot — Session Handoff

> **Claude Code: Read this file at the start of EVERY session before doing any work.**
> Report its contents to the user when starting, so they know the current state.
> Update this file before every sign-off.

---

## Last Session

| Field | Value |
|---|---|
| Who | Durga + Claude Code (Opus 4.7) — long afternoon closing staff-reported issues + building auto-resolve infra |
| Latest push | 2026-07-01 14:06 IST — Durga/Claude (`4528ab7`) |
| Handed off to | Open |
| Deployed | ✅ Yes — https://eventpilot.tresconglobal.com (Railway auto-deploy from main; boot at `4528ab7` verified 15:37 IST) |

**Session highlight:** the review lifecycle is now deploy-verified end-to-end. Once a fix is pushed and its SHA is written to `platform_reviews.fix_commit_sha`, Railway's next boot resolves the review automatically and fires the Admin auto-response comment. No more manual PATCHing after deploy.

---

## What Was Built — 01 Jul 2026 (Durga / Claude Code, afternoon)

Seven commits, one schema migration, and a DB cleanup. Nearly everything driven by real staff reports from `platform_reviews` — this session closed **5 filed issues** end-to-end and proactively silenced a stale infra problem.

### 🕐 11:23 IST · `c9ca194` — HANDOFF.md reconciled
Prior handoff was stale (missed 30 Jun afternoon + 4 Madhu commits). Reconstructed the missing session entries from git log so this file was current going into today.

### 🕐 11:49 IST · `8da61a4` — Assessment module UX v2 (219 lines · closes 3 staff reviews)
Fixes for Fouzan Abdul Rahim, Karthik C, and Md Akram Shekh's reviews on the course/assessment flow:
- **65-second question timer** (was 45) — Fouzan's ask
- **Task-completion gate before test entry** — Karthik's ask; now validates all required task steps before letting the test start
- **Non-committal answers with Next button** — replaced "single-click = submit" with select-then-Next; added a review screen at the end for edits
- **Feedback screen persistence** — no longer disappears after submit (Md Akram)
- **ReviewWidget** — small fix so widget doesn't unmount when auth state briefly flips (`if (isPublicPage) return null; if (!authed && !open) return null`)

Files: `app/dashboard/course/[id]/page.tsx`, `app/components/ReviewWidget.tsx`.

### 🕐 12:28 IST · `13cf704` — Silenced Vercel deployment error emails
Vercel was retired 18 Jun but `vercel.json` (with 2 dead crons) remained. Vercel-GitHub App still fires on every push, tries to build, fails, emails `reachcharan@gmail.com`.
- Deleted `vercel.json` (the 2 crons — `/api/cron/attendance-sync` 01:00 UTC and `/api/cron/hrms-sync` 19:30 UTC — had been silently unrun for 13 days)
- Added `.vercelignore` with `*` to skip any lingering Vercel build
- **Not fully fixed** — the GitHub App webhook is still installed on `Trescon-Events/eventpilot` and needs to be uninstalled via Vercel dashboard or GitHub App settings. See Known Issues.
- **New gap surfaced** — those 2 dead crons need a Railway or GitHub Actions replacement. See What's Next.

### 🕐 12:40 IST · `a6cbace` — Review auto-response system
When an admin flips a `platform_reviews` row to `resolved`, Gemini 2.5-flash drafts a warm, first-name-personalised "Admin" comment quoting `admin_notes` as the fix summary. Signs as "— Admin", 70-160 words, no markdown / emojis / exclamations.
- New: `app/lib/review-auto-response.ts` — `generateAdminResponse()` + `firstName()`
- Modified: `app/api/reviews/[id]/route.ts` PATCH — fires auto-response block on resolve transition when no manual response was typed
- **Backfilled 19 admin comments** retroactively for all reviews that had been resolved without a response (via `scripts/backfill-review-responses.mjs`, gitignored — contains hardcoded FIX_MAP with per-review summaries)

### 🕐 13:45 IST · `b5a8376` — Bespoke Tracker access (Nicholas Nunes report, HIGH)
Nicholas has `staff_members.tool_grants.bespoke=true` but was silently redirected to `/dashboard` when opening the tracker. Root cause: `middleware.ts` treated all `/admin/*` as admin-only except a hardcoded allowlist (`toolkit`, event tool subroutes) that didn't include `/admin/bespoke`.
- `middleware.ts` — added `/admin/bespoke` to `isToolRoute` allowlist so grant-holders can reach the route
- `app/admin/bespoke/layout.tsx` (new) — client-side gate that reads `/api/toolkit-access` and enforces `grants.bespoke === true` for non-admins (same pattern already used by `/admin/toolkit`)

### 🕐 13:51 IST · `4f7737c` — Pilot Projects page unresponsive (Fouzan report, MEDIUM)
Fouzan reported "cannot tick any boxes" on `/pilots`. Root cause: `app/pilots/page.tsx` was reading `sessionData.staff.id` / `sessionData.staff.isAdmin` from `/api/auth/session`, but that endpoint returns the raw session cookie payload `{ sid, jl, adm, dept, roles }` at the top level — no nested `staff` object. Both values were `undefined`. Since Fouzan is `tracking` role in both his projects, the tracker view rendered, and `readonly = !isAdmin && item.assigned_to !== staffId` resolved to `true` for every row.
- `app/pilots/page.tsx` — 4-line fix reading `sessionData.sid` and `sessionData.adm`

### 🕐 13:54 IST · `49c8e99` — Stop auto-reopening resolved reviews on staff reply
`POST /api/reviews/[id]/comment` was flipping `resolved → in_progress` whenever a staff member replied to their own resolved review. Fouzan's polite "Thank you, have a nice day" tripped it. Design was too aggressive — admins already get bell notifications for staff replies and can decide manually if a reopen is warranted.
- Removed the auto-reopen block (status update + trail entry insertion)
- Dropped the `reopened` field from the response
- Simplified `app/dashboard/page.tsx` reply handler that had been reading `data.reopened`
- Also cleaned up Fouzan's Assessment review in DB: restored to `resolved`, deleted the bogus reopen trail entry

### 🕐 14:06 IST · `4528ab7` — Deploy-verified auto-resolve on boot ⭐
The big one. Closes the loop between "code fix pushed" and "review status flipped to resolved" — no more manual PATCHing after a Railway deploy.

**How it works:**
1. Admin flips a review to `in_progress` with `admin_notes` (fix summary) and `fix_commit_sha` (the pushed commit)
2. Railway detects the push and starts building
3. On boot, `instrumentation.ts` calls `resolveDeployedReviews()` from `app/lib/review-auto-resolve.ts`
4. Resolver reads `process.env.RAILWAY_GIT_COMMIT_SHA` (deployed SHA) and hits GitHub's public compare API (`GET /repos/Trescon-Events/eventpilot/compare/{fix_sha}...{deployed_sha}`)
5. If `status === 'ahead' || 'identical'` — the fix is in the deploy — flip to `resolved`, insert status_change comment, draft + insert Admin auto-response, notify reporter

**What was built:**
- New column: `platform_reviews.fix_commit_sha TEXT` (migrated via pg direct to `db.yuyxfxoevztugtfgduks.supabase.co` — pooler tenant lookup failed locally)
- New file: `app/lib/review-auto-resolve.ts` — shared `resolveReview()` helper used by both PATCH and boot
- New file: `instrumentation.ts` (root) — Next.js instrumentation hook, guarded to `NEXT_RUNTIME === 'nodejs'`
- Refactored: `app/api/reviews/[id]/route.ts` PATCH delegates resolves to the shared helper; accepts a new `fix_commit_sha` field in its body

**End-to-end verified:** Nicholas + Fouzan Pilot both auto-resolved at 15:38 IST when Railway booted the `4528ab7` build. Auto-response comments were posted within 5 seconds of the flip, quoting the fix summaries from `admin_notes` in plain English.

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

### 🕐 12:33 – 14:06 IST · Madhu's setup-pilots + IPv4 series

A cascade of fixes to make `POST /api/admin/setup-pilots` reliably run its DDL migration on Railway. Root cause: Railway has no IPv6 outbound, and Supabase's pooler resolves to AAAA records first. The pg client couldn't connect.

- `8aaab2a` (12:33) — endpoint runs DDL migration via `pg` before seeding
- `4f90db2` (12:58) — allow the endpoint to be triggered via `x-setup-key` header
- `ceda3be` (12:58) — exempt `/api/admin/setup-pilots` from middleware auth redirect
- `bffcb40` (13:14) — `await params` in dynamic route + install `@types/pg` for TS build
- `4180f13` (13:43) — use direct Supabase host instead of pooler
- `a2c989f` (13:49) — force IPv4 DNS via env
- `a1f6023` (14:02) — resolve pooler to IPv4 via `dns.resolve4` before connecting
- `583e25d` (14:06) — final: `dns.setDefaultResultOrder('ipv4first')`

**Reusable pattern flagged:** `dns.setDefaultResultOrder('ipv4first')` should be at the top of any file that opens a direct pg connection from Railway.

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

1. **Vercel-GitHub App webhook still installed on `Trescon-Events/eventpilot`** — `vercel.json` deletion silences successful builds (nothing to build now) but the webhook still fires on every push. To permanently stop: uninstall the Vercel GitHub App from the org (GitHub → Settings → GitHub Apps → Vercel → Configure → remove `eventpilot`) OR delete the `taos-discovery` project in the Vercel dashboard. **Dashboard action only — Durga.**
2. **`attendance-sync` + `hrms-sync` crons dead for 13+ days** — both were Vercel crons in the deleted `vercel.json` (01:00 UTC and 19:30 UTC). Need a new home: Railway cron or a `.github/workflows/*.yml` on schedule. Nothing has been syncing.
3. **Finance pages may still show blank** — session-cookie client-side parse issue. API fallback added twice now (finance pages + RealtimeNotifications) but may not be applied universally. Needs a shared session-reader utility or systemic fix.
4. **Platform Updates ("What's Next")** shows static dev build-log entries — it's a dev changelog, not a user-facing update feed. Needs redesign.
5. **Payroll grades** (L1-EX) are default placeholders — need Trescon's actual grade structure from HR/Madhu.
6. **`middleware.ts` deprecation warning (Next.js 16)** — the "middleware" file convention is deprecated and should be renamed to `proxy`. Non-blocking today but scheduled for removal in a future Next.js. See: https://nextjs.org/docs/messages/middleware-to-proxy
7. **Super-admin Realtime blackout** — RealtimeNotifications.tsx deliberately skips Supabase Realtime for super-admin (no UUID to subscribe with). If Madhu needs live notifications, needs a workaround.
8. **Tracker-role Pilot users only see their own items** — `/api/pilots` filters `visibleItems` to `assigned_to === session.sid` for non-admins. For a `tracking` role user (like Fouzan), the intent of the role is to see everyone's items, not just their own. Design decision needed: should tracking role bypass the per-user filter server-side? Client tracker view already handles read-only for non-owned items.

---

## What's Next

### Pending — needs Durga action (dashboard only)

1. **Uninstall Vercel GitHub App on `Trescon-Events/eventpilot`** — permanent fix for the residual webhook fires.
2. **Restore attendance-sync + hrms-sync scheduled jobs** — Railway cron or GitHub Actions.

### Pending — waiting for Madhu

3. **HRMS Supabase access** — old project `smdqljhuwcnfhzezrlbg` not in Trescon org. Need dashboard access or Realtime publication on `attendance_records` table.
4. **Canva env vars** — `CANVA_CLIENT_ID` + `CANVA_CLIENT_SECRET` on Railway.
5. **HR Attendance & Payroll plan** — saved in memory (`project_hr_attendance_plan.md`):
   - Holiday calendar per office (Dubai vs India)
   - LOP auto-calculation
   - Attendance percentage
   - Multi-currency payroll (INR India, AED Dubai, USD P&L)
   - Monthly attendance summary reports
   - Regularisation requests, comp-off, leave encashment
6. **Payroll grades** — confirm Trescon's actual grade structure (L1-EX are defaults).

### Pending — active Pilot Projects (SME-led)

7. **Bespoke Event Module (Nicholas)** — 4 scope decisions with Nicholas + Durga; Nicholas gathering 10 landing pages, 10 emailers, 2-3 Closely templates, 20 social posts. Waiting on Phase 1 scope lock. (Access issue that blocked him from opening the tracker was fixed today — `b5a8376`.)
8. **Corporate Marketing Module (Thulasi)** — 4 scope decisions with Thulasi + Durga; Social recommended as Phase 1. Waiting on Phase 1 scope lock.

### Pending — can build anytime

9. **Finance page blank fix** — deeper investigation on session-cookie format; consider consolidating to a shared session-reader utility.
10. **Platform Updates redesign** — change from dev build log to actual user-facing changelog.
11. **Recruitment JD builder** — AI-assisted job description creation, publishable to platforms.
12. **Overall UI/UX audit** — Durga flagged HR portal, Recruitment, Finance as amateur-looking. Multiple pages need polish.
13. **Migrate `middleware.ts` → `proxy.ts`** — Next.js 16 deprecation. Small, mechanical migration.
14. **Tracker-role visibility in `/api/pilots`** — see Known Issues #8.

---

## Key Decisions Made This Session (01 Jul afternoon)

- **Review lifecycle is now deploy-verified.** Once `admin_notes` + `fix_commit_sha` are set on an `in_progress` review, the next Railway boot that includes the fix commit resolves it automatically and posts the Admin auto-response. No manual step post-deploy.
- **Auto-response tone locked:** "Admin" attribution (never the resolving admin's name), 70-160 words, no markdown / emojis / exclamations, quotes reporter's title + `admin_notes` fix summary. Enforced in `app/lib/review-auto-response.ts` prompt and post-processing.
- **Staff replies never auto-reopen resolved reviews.** Admins get bell notifications and decide manually. Prevents "thank you" messages from silently reverting status.
- **`isToolRoute` allowlist in middleware is the pattern for tool-gated admin sections.** Middleware lets grant-holders through; the section's own layout enforces the specific `tool_grants.<key>` check via `/api/toolkit-access`. Applies to `/admin/toolkit`, event tool subroutes, and now `/admin/bespoke`.

### Key decisions from earlier sessions still current

- India salary in INR, Dubai salary in AED — USD equivalent shown everywhere for P&L
- Exchange rates: AED 0.2723, INR 0.01189 (approximate, hardcoded for now)
- Payroll grades L1-EX are placeholders — to be confirmed with Trescon HR
- Finance pages should always show table structure with headers + sample row even when empty
- Sample recruitment data created for demo — marked with yellow "Sample Data" banner
- **Pilot Projects model (Madhu, 01 Jul morning):** SME owns PRD, Durga builds, Fouzan tracks, Madhu sets direction only. All prompts must be written using SME_CONTEXT.md as context.
- **Session-fallback pattern:** when `tcs_session` cookie parse fails client-side, fall back to `/api/auth/session`. Used in finance pages + RealtimeNotifications. Should be extracted to a shared utility.

---

## Reviews Closed This Session

| Reporter | Title | Severity | Fixed by |
|---|---|---|---|
| Fouzan Abdul Rahim | Assessment module | MEDIUM | `8da61a4` (65s timer + review screen + non-committal answers) |
| Karthik C | Course task validation issue | MEDIUM | `8da61a4` (task gate + review screen) |
| Md Akram Shekh | Need to improve | HIGH | `8da61a4` (all four items in one shot) |
| Nicholas Nunes | Bespoke Tracker not working | HIGH | `b5a8376` (middleware allowlist + layout gate) |
| Fouzan Abdul Rahim | Pilot Projects page unresponsive | MEDIUM | `4f7737c` (session field shape) |

Plus 19 historical admin comments backfilled retroactively for previously-resolved reviews that had no admin response.

---

## Previous Sessions

- **01 Jul 2026 — Durga/Claude (afternoon)** — Assessment module UX v2, Vercel silencer, review auto-response system + 19-comment backfill, Bespoke Tracker access fix, Pilot Projects unresponsive fix, staff-reply auto-reopen removed, **deploy-verified auto-resolve infrastructure**
- **01 Jul 2026 — Madhu** — Pilot Projects launch (10 files, 1,625 lines) + IPv4 DNS series for pg DDL migrations on Railway
- **30 Jun 2026 — Durga (afternoon)** — Messages fixes (staff search, scroll behaviour, inbox sort); Notification sound toggle + session fallback in RealtimeNotifications
- **30 Jun 2026 — Durga (morning)** — Recruitment sample data + Kanban UI, HR Portal dashboard polish, Finance empty-state tables, Salary multi-currency, CRITICAL fixes (`/api/hr/staff` GET + session cookie fallback)
- **29 Jun 2026 — Durga (major session)** — Timesheets, Salary, Performance Reviews, Expense Claims, Vendor Payments, Payroll Summary, Finance Portal, Event Intelligence Brief, real-time notifications (Supabase Realtime + sound + browser push), 5-minute attendance sync. Restructured: Toolkit (6 categories, 14 tools, dark sidebar, collapsible dropdowns), Admin nav bar, Finance/HR separation, Event workspace RACI flow. Fixed: PDF extraction, TypeScript build blocker.
- **28 Jun 2026 — Durga** — Bespoke Tracker full build (3 tables, 3 APIs, 3 pages, 53 auto-generated tasks)
- **26 Jun 2026 — Durga** — Content Engine upgrades, Messaging restored, Dashboard layout fixes, Commercial P&L crash fix
- **25 Jun 2026 — Durga** — Commercial Tracker full BRD implementation (8 tables, 15 APIs, Executive Dashboard + Event Workspace)

---

*This handoff was written by Claude Code (Opus 4.7) on 2026-07-01 15:45 IST, after a 4-hour afternoon session with Durga that closed 5 filed platform_reviews issues and built the deploy-verified auto-resolve system (`4528ab7`). All 8 commits are pushed to `origin/main`; Railway has booted the latest at 15:37 IST. Local main is synced.*
