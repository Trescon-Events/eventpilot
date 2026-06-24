# EventPilot — Session Handoff

> **Claude Code: Read this file at the start of EVERY session before doing any work.**
> Report its contents to the user when starting, so they know the current state.
> Update this file before every sign-off.

---

## Handoff Protocol

**Before starting work:** Read this file. Tell the user: who last worked, what they did, and what's next.
**Before signing off:** Update the Last Session block, What Was Built, and What's Next. Commit the updated HANDOFF.md.

---

## Last Session

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| Who           | Durga + Claude Code (Opus 4.6)                                     |
| Date          | 2026-06-25                                                         |
| Handed off to | Madhu / Open                                                       |
| Deployed      | Yes — https://eventpilot.tresconglobal.com (Railway, production, 25 Jun 2026) |

---

## What Was Built This Session (25 Jun 2026 — Durga)

### Commercial Tracker — Full BRD Implementation (CEO requirement)

Built the complete Commercial Tracker module per Naveen Bharadwaj's 20-section BRD. This is a new financial management system inside Event Pilot.

#### Database (3 migration files, 8 new tables, 15+ column additions):
- `commercial_inventory` — revenue target items (Category → Subcategory → Item → Qty → Price)
- `overhead_config` + `overhead_event_allocations` — 9 overhead components, 4 allocation models
- `commercial_adjusted` — adjusted forecast tracking (Budgeted/Adjusted/Current/Difference)
- `commercial_scenarios` — best/expected/worst case what-if analysis
- `commercial_weekly_snapshots` — weekly P&L trend data
- `corporate_allocations` — corporate allocation layer (% or fixed)
- `commercial_approvals` — 4-step approval chain (BU Head → Commercial Director → Finance → CEO)
- Extended `events` — revenue_target, cost_budget, bu_head_id, operations_lead_id, finance_owner_id, closure_status
- Extended `event_deals` — 11 deal types (was 5), inventory_item_id link
- Extended `event_expenses` — vendor_name, po_number, invoice_number, payment_status, approval_status
- Extended `expense_categories` — parent_id for subcategory hierarchy, seeded subcategories
- Extended `staff_salary_records` — cost_center field

#### APIs (15 new routes under /api/events/commercial/):
- `inventory` — CRUD for revenue target items
- `staff-costs` — auto-calculates from timesheets + salary records (formula: salary × days / working days)
- `overheads/config` + `overheads/allocations` + `overheads` — overhead cost pool management + calculator
- `adjusted` — adjusted forecast CRUD
- `summary` — master 4-column P&L engine (Revenue - Direct Costs - Staff Costs - Overheads = Gross Profit - Corporate Allocations = Net Profit) with 6 metrics (Gross Margin, Net Margin, Revenue Achievement, Budget Variance, Cost Variance, ROI)
- `executive` — portfolio dashboard with full P&L per event (includes staff costs + overheads)
- `scenarios` — what-if analysis CRUD + calculator
- `approvals` — 4-step approval workflow
- `corporate-allocations` — corporate allocation CRUD
- `snapshot` — weekly P&L snapshot
- `cron/commercial-snapshot` — cron endpoint for weekly auto-snapshot

#### UI (2 new pages):
- `/admin/commercial` — Executive Dashboard: KPI cards with donut charts, cost breakdown bars, event cards/table toggle, filters (region/BU/status), traffic light indicators
- `/admin/commercial/[eventId]` — Event Commercial Workspace: 8 tabs (Summary, Revenue, Staff Costs, Direct Costs, Overheads, P&L Statement, Scenarios, Approvals), 4-column tables everywhere, subcategory grouping, salary missing warnings, vendor/PO/invoice tracking

#### Architecture cleanup:
- Removed 863 lines of duplicate P&L from Event Workspace (`/admin/events/[id]`)
- Event Workspace is now operations-only (checklist, RACI, planning, brand, website, content)
- Single "Open Commercial Tracker" button links to `/admin/commercial/[eventId]`
- "Commercial" tab added to admin dashboard tab bar
- "Commercial Tracker" added to PlatformMenu sidebar under Administration

#### Bug Fixes (2 staff-reported issues from Khalifatur Rahman):
1. **Toolkit — recent projects** (CRITICAL): EventPicker now shows "Your Recent Projects" section at top with events that have existing website drafts or brand guidelines. "In Progress" badge. No more searching for unfinished work.
2. **Website Builder — save after upload** (MEDIUM): Speaker photos and sponsor logos now auto-save to DB immediately after upload via PATCH. No more lost files if user doesn't click Save.

#### CLI Tool:
- `scripts/issues.mjs` — manage staff-reported issues from terminal (list/view/resolve/reply/feedback). Both issues resolved and staff notified.

---

## What Was Built This Session (19 Jun 2026 — Durga)

### 1. CLAUDE.md Updated
- Hosting row updated (Vercel → Railway), Supabase login updated to dc@tresconglobal.com, build flow and hard rules updated.

---

### 2. Assessment Submit — Full End-to-End Fix

Staff were stuck on "Submitting..." and AIRS score was not showing after SSO. Four root causes, all fixed:

| # | Root Cause | File Fixed |
|---|---|---|
| 1 | `/api/task-profiles` not in PUBLIC_PREFIXES — middleware blocked unauthenticated POST, returned HTML, fetch crashed | `middleware.ts` |
| 2 | Middleware only encoded `pathname` in next param — `?id=UUID` was stripped, staff landed on `/dashboard` with no ID after SSO | `middleware.ts` |
| 3 | Login page SSO button was static `href="/api/auth/microsoft"` — never passed `next` param through | `app/login/page.tsx` |
| 4 | `profile_complete = true` update silently discarded error — SSO callback looped staff back to `/profile` | `app/api/task-profiles/route.ts`, `app/profile/page.tsx`, new `app/api/task-profiles/mark-complete/route.ts` |

**Status:** Confirmed working by Durga (19 Jun 2026).

---

### 3. Checklist Not Saving — Fixed

Staff were toggling tasks but status reverted on next page load. Optimistic UI update had no error check — if PATCH failed, local state showed success but DB was not updated.
- `app/dashboard/page.tsx` — status toggle and notes Save both revert to previous value if PATCH returns non-200.

---

### 4. AIRS Scoring Redesign — 3-Signal Model

All 16 staff who took the assessment were falling in "AI-Curious". Root cause: score was driven only by the `ai_readiness` slider. `automation_history` and `tool_proficiency` were already collected and stored but completely ignored.

**`app/lib/airs.ts`** — new `questBase()` uses 3 signals:
- `ai_readiness` → 10–65 pts (was 10–75)
- `automation_history` → 0–15 pts bonus
- `tool_proficiency` avg → 0–10 pts bonus
- Questionnaire still capped at 75. Course bonus still capped at 25. Total still capped at 100.

**`app/dashboard/page.tsx`** — breakdown panel shows each signal's contribution.

No DB migration needed — uses existing stored `responses` JSONB data.

---

### 5. Admin Dashboard AIRS — Two Critical Fixes

The admin "AI Readiness Score" panel was completely broken — showing "No assessments completed yet" and all 16 staff as AI-Unaware despite having data.

**Bug 1 — `app/api/task-profiles/route.ts`**
GET route ordered by `created_at` which does not exist on `staff_task_profiles`. Supabase returned a silent error. Admin page got `tasksRes.ok = false`, never called `setTasks`, `tasks` stayed `[]` forever.
- Fixed: `.order('created_at')` → `.order('submitted_at')`

**Bug 2 — `app/admin/page.tsx`**
Admin page had its own `calcAIRS` that accessed `t.ai_readiness` and `t.tools_used` on the outer profile row — but those fields live inside `responses[]` JSONB. `readScores` and `allTools` were always empty. Every assessed staff member scored exactly 25 (engagement rate only).
- Fixed: imported `computeAIRS` from `app/lib/airs.ts` — single source of truth
- Added `profileByStaff` map: `staff_id → responses[]`
- Individual, dept, and org scores all computed from `computeAIRS(responses)` per member

**Confirmed live scores after fix:**

| Name | Score | Tier |
|---|---|---|
| Sajeesh Kombath | 75 | AI-Forward |
| Krishanu Karmakar | 75 | AI-Forward |
| Fouzan Abdul Rahim | 74 | AI-Ready |
| Prashant Mual | 71 | AI-Ready |
| Nicholas Nunes | 69 | AI-Ready |
| Simran Arora | 57 | AI-Ready |
| Imran Mushtaq | 49 | AI-Aware |
| Karthik C | 49 | AI-Aware |
| Naveen Bharadwaj | 45 | AI-Aware |
| Samprity Dutta | 43 | AI-Aware |
| Kalander Shafi | 26 | AI-Curious |
| Utkarsh Pant | 20 | AI-Curious |

Org avg (assessed only): ~56 → **AI-Ready**

---

## What Was Built This Session (18 Jun 2026 — Madhu)

### Vercel → Railway Migration (complete)

**Why this happened:**
Vercel's account was paused for a spend cap being hit (Durga's session noted this). Rather than just fixing the cap, Madhu decided to drop Vercel entirely and move to a cheaper, more scalable platform. The original plan was Cloudflare Workers (Durga had already added `open-next.config.ts` and `wrangler.jsonc`), but the CF Workers attempt failed — EventPilot's bundle is 16MB and CF Workers caps out at 10MB even on the paid plan. Since the app will keep growing (full HRMS, event management, content generation all coming), any size-capped platform is a dead end. Railway was chosen: no bundle size limits, same auto-deploy-from-GitHub behaviour as Vercel, standard Node.js (`next start`), ~$5/month vs Vercel Pro at ~$20/month.

**What was done:**
1. Built the app for CF Workers (`npx @opennextjs/cloudflare build`) — succeeded but deploy failed (16MB > 10MB limit)
2. Created Railway project `eventpilot` under `Trescon's Projects` workspace
3. Set all 28 env vars from `.env.local` into Railway via API
4. Deployed the app to Railway via `railway up` — build succeeded, app online
5. Railway URL: `https://eventpilot-production-90c6.up.railway.app`
6. Updated `eventpilot-proxy` Cloudflare Worker to proxy to Railway URL instead of Vercel
7. Verified live domain: login 200 ✅, SSO 307 ✅, admin 307 ✅
8. Connected `Trescon-Events/eventpilot` GitHub repo to Railway service (auto-deploy on push to `main`)
9. Deleted Vercel project, cancelled Vercel subscription

**New infrastructure (as of 18 Jun 2026):**
```
Browser → eventpilot.tresconglobal.com
            │
            ▼ (Cloudflare DNS, proxied)
         Cloudflare Worker: eventpilot-proxy
            │
            ▼
         Railway: eventpilot-production-90c6.up.railway.app
            │  (Next.js 16, Node.js runtime, next start)
            ▼
         Supabase: yuyxfxoevztugtfgduks
```

**How to deploy going forward (for Durga):**

Just push to `main`:
```bash
git push origin main
```

That's it. Railway picks up the push via GitHub webhook, runs `next build`, and deploys automatically. No Vercel CLI, no `railway up`, no manual steps. You can watch the build at `railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4`.

**If you have local uncommitted changes:**
```bash
git add <your files>
git commit -m "your message"
git push origin main
```
Railway will deploy within ~3 minutes of the push.

**Railway account:** `webadmin@tresconglobal.com` (GitHub: `tresconevents`)
**Railway project URL:** `https://railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4`

---

## What Was Built This Session (18 Jun 2026 — Durga)

### 1. AIRS Assessment Submit — Root Cause Fixed

Staff were getting stuck on "Submitting..." on the last question of the AIRS assessment and could never complete it. Two previous attempts to fix it (server action → API route) had not resolved the issue.

**Root cause:** `/profile` and `/api/task-profiles` were not in the middleware public routes list. Staff arrive at `/profile` before they have a session cookie (from a welcome email or direct link). When they hit Submit, the POST to `/api/task-profiles` was intercepted by the auth middleware and silently redirected to `/login` — returning HTML instead of JSON. The fetch crashed, pending state was never reset, button froze forever.

**Files changed:**
- `middleware.ts` — added `/profile`, `/api/verify-staff`, `/api/task-profiles` to `PUBLIC_PREFIXES`
- `app/profile/page.tsx` — added 15s AbortController timeout, double-submit guard (`if (pending) return`), proper non-200 error handling, real error messages shown to user

**Status:** Deployed and live. Staff should be able to complete the assessment now. Ask 2–3 staff to test and confirm.

---

### 2. Vercel Spend Cap — Site Outage

The live site went down with "This deployment is temporarily paused". Cause: Vercel account spend management cap was hit on the `trescons-projects` account.

**Action needed by Madhu:** Log into Vercel → `trescons-projects` → **Settings → Billing → Spend Management** → raise or remove the monthly cap. The site came back once the cap was addressed but this will happen again if not permanently fixed.

**Do NOT touch Deployment Protection** — it was disabled via REST API on 17 Jun during the SSO fix. Leave it as-is.

---

## What Was Built This Session (17 Jun 2026 — Madhu)

### SSO Outage — Root Cause Investigation & Full Fix

All staff were unable to log in via Microsoft SSO. Error shown: "SSO state mismatch — please try again." Users also intermittently saw a "Vercel Authentication" wall mid-flow. Full investigation and fix completed. See the **⚠️ Incident Report** section below for the complete breakdown — it is mandatory reading for anyone touching hosting, Cloudflare, or Vercel.

**Files changed:**
- `app/api/auth/microsoft/route.ts` — `redirect_uri` now uses `NEXT_PUBLIC_SITE_URL` instead of `req.nextUrl.origin` (which resolved to the internal Vercel URL through the proxy)
- `app/api/auth/callback/route.ts` — ALL redirects (success, error, access-pending) now use `NEXT_PUBLIC_SITE_URL`. The final post-login redirect was rebuilt using `new URL(destination, origin)` instead of `req.nextUrl.clone()` which was inheriting the internal Vercel URL
- Cloudflare Worker `eventpilot-proxy` — updated via Cloudflare API to proxy to `eventpilot-trescons-projects.vercel.app` (was: `taos-discovery.vercel.app`, a deleted/stale Vercel project)
- Vercel project `trescons-projects/eventpilot` — Microsoft SSO env vars were empty strings; repopulated via CLI + REST API
- Vercel project `trescons-projects/eventpilot` — SSO deployment protection disabled via Vercel API (was blocking the Cloudflare Worker proxy with auth walls)

---

## ⚠️ INCIDENT REPORT: SSO Outage — 17 Jun 2026

**Severity:** Critical (100% of users blocked from logging in)
**Duration:** Unknown start (discovered 17 Jun) — fixed same day
**Triggered by:** Durga's hosting migration work on 16–17 Jun

---

### What Broke and Why — Layer by Layer

#### Layer 1 — Wrong Cloudflare Worker target (root cause)

The Cloudflare Worker `eventpilot-proxy` handles ALL traffic to `eventpilot.tresconglobal.com`. It proxies requests to a backend Vercel URL. It was set to proxy to **`taos-discovery.vercel.app`** — an OLD Vercel project that no longer had a live deployment or env vars.

The active Vercel project (`trescons-projects/eventpilot`) was reachable at `eventpilot-trescons-projects.vercel.app`, but the Worker didn't know this. So all staff were hitting a dead Vercel project.

#### Layer 2 — Microsoft SSO env vars were empty in Vercel

In the `trescons-projects/eventpilot` Vercel project, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID` were present as variable names but stored as **empty strings** — placeholders that were never filled. This caused `/api/auth/microsoft` to return `503 — Microsoft SSO not configured` even after the Worker target was fixed.

#### Layer 3 — SSO routes used `req.nextUrl.origin` (wrong domain through proxy)

`app/api/auth/microsoft/route.ts` and `app/api/auth/callback/route.ts` both derived the OAuth `redirect_uri` and all post-login redirect destinations from `req.nextUrl.origin`. When requests arrive via the Cloudflare Worker proxy (which rewrites the host to `eventpilot-trescons-projects.vercel.app`), `req.nextUrl.origin` resolves to `https://eventpilot-trescons-projects.vercel.app`, NOT `https://eventpilot.tresconglobal.com`. This caused:
- `redirect_uri` sent to Azure → internal Vercel URL (Azure would reject if not pre-registered)
- Post-login redirect sent the user's browser DIRECTLY to `eventpilot-trescons-projects.vercel.app/dashboard` (bypassing the Worker), which showed the Vercel auth wall
- `sso_state` cookie set on `eventpilot.tresconglobal.com` was not sent when the browser navigated directly to the Vercel URL → "SSO state mismatch" error

#### Layer 4 — Vercel deployment protection blocked the Worker

The Vercel project had SSO protection set to `all_except_custom_domains`, meaning every request to `eventpilot-trescons-projects.vercel.app` (including the Worker's server-to-server proxy requests) was intercepted by Vercel's own auth wall. Even with an automation bypass token in the Worker header, this was unreliable and caused the Vercel auth screen to flash mid-flow in the user's browser.

---

### What Was Done to Fix It

| Step | Action |
|------|--------|
| 1 | Verified SSO env vars existed but were empty strings in Vercel |
| 2 | Deleted the 3 empty Microsoft env vars from Vercel |
| 3 | Re-added all 3 with correct values from `.env.local` via CLI and confirmed via REST API |
| 4 | Updated the Cloudflare Worker (`eventpilot-proxy`) to proxy to `eventpilot-trescons-projects.vercel.app` instead of `taos-discovery.vercel.app` |
| 5 | Added Vercel automation bypass token (`x-vercel-protection-bypass`) to Worker headers |
| 6 | Disabled Vercel SSO protection on the project via REST API (`ssoProtection: null`) |
| 7 | Fixed `app/api/auth/microsoft/route.ts` — `redirect_uri` now uses `process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin` |
| 8 | Fixed `app/api/auth/callback/route.ts` — `origin` overridden at top of function to `NEXT_PUBLIC_SITE_URL`; final redirect rebuilt as `new URL(destination, origin)` instead of `req.nextUrl.clone()` |
| 9 | Deployed, verified: SSO endpoint returns 307 → `login.microsoftonline.com` with correct `redirect_uri=https://eventpilot.tresconglobal.com/api/auth/callback`; `sso_state` cookie correctly set for `eventpilot.tresconglobal.com` |

---

### Safety Rules — MANDATORY for Durga and Madhu

These rules must be followed to prevent a repeat. **Any Claude session working on hosting or auth must read and apply these.**

#### 🔴 HOSTING RULES

**1. Vercel is gone. Do not reference or restore it.**
The Vercel project (`trescons-projects/eventpilot`) has been deleted and the subscription cancelled as of 18 Jun 2026. The app runs on Railway. Do not attempt to redeploy to Vercel or add Vercel-specific config.

**2. The Cloudflare Worker IS the production router.**
`eventpilot.tresconglobal.com` goes through the `eventpilot-proxy` Cloudflare Worker, which proxies to the Railway deployment. If Railway's URL ever changes (e.g., a new Railway project), the Worker must be updated to point to the new URL. The Worker and the Railway service it points to are a tightly coupled pair.

Current state as of 18 Jun 2026:
- Worker: `eventpilot-proxy` → `eventpilot-production-90c6.up.railway.app`
- Railway project: `Trescon's Projects / eventpilot` (GitHub: `tresconevents`, `webadmin@tresconglobal.com`)
- Vercel: **deleted and cancelled**

**3. Do NOT attempt a Cloudflare Workers migration.**
`open-next.config.ts` and `wrangler.jsonc` are in the repo from a previous attempt. That migration was abandoned — the app bundle is 16MB and CF Workers caps at 10MB. The app will only grow. Railway has no size limits. Leave the CF Workers config files in place (they're harmless) but do not run `wrangler deploy`.

#### 🔴 ENV VAR RULES

**4. Env vars live in Railway. `.env.local` is only for local development.**
`.env.local` is not deployed. Every env var in `.env.local` must also exist in the Railway project. All 28+ vars were set on 18 Jun 2026. If you add a new env var locally, also add it in Railway: go to the Railway project → eventpilot service → Variables tab.

**5. Never set an env var as an empty string placeholder.**
This was how the Microsoft vars were broken in Vercel. Either set the real value or don't add the key at all. An empty-string env var silently fails in the app (no error at build time, runtime returns 503 with a vague message).

**6. After any env var change in Railway, Railway redeploys automatically.**
Railway triggers a new deployment when you save a variable change. Then test:
```
curl -s https://eventpilot.tresconglobal.com/api/auth/microsoft
# Must return HTTP 307 (redirect to Microsoft), NOT 503
```

#### 🟡 SSO ARCHITECTURE RULES

**7. SSO routes must never use `req.nextUrl.origin` for redirect URIs or post-login destinations.**
Because all production traffic goes through a Cloudflare Worker proxy, `req.nextUrl.origin` will resolve to the internal Railway URL (`eventpilot-production-90c6.up.railway.app`), not the public domain. All OAuth URIs and redirects in `app/api/auth/microsoft/route.ts` and `app/api/auth/callback/route.ts` are fixed to use `process.env.NEXT_PUBLIC_SITE_URL`. Do not revert this. If you add new auth routes, follow the same pattern.

**8. The Azure App registration must match the public domain.**
Azure App (client ID `1eb65a1b-849d-414f-88f4-e0faf812fbfc`) has `https://eventpilot.tresconglobal.com/api/auth/callback` registered as a redirect URI. If the domain ever changes, you must update the Azure App registration in Entra ID (ask Madhu for access). If you add a new redirect URI (e.g., for localhost testing), add it to Azure first, then to the code.

**9. Vercel deployment SSO protection must remain disabled.**
The Vercel project's `ssoProtection` was set to `all_except_custom_domains`. This means all traffic to `eventpilot-trescons-projects.vercel.app` (including the Worker's proxy requests) hits a Vercel auth wall. This has been disabled (`ssoProtection: null`). Do not re-enable it unless the Cloudflare Worker proxy is removed and DNS points directly to Vercel. Check via:
```
vercel project ls  # confirm trescons-projects/eventpilot
# Then check settings in Vercel dashboard: Settings → Deployment Protection
```

#### 🟡 CLOUDFLARE WORKER RULES

**10. Any change to `eventpilot-proxy` must be tested immediately after deployment.**
The Worker is the single gateway for all production traffic. A bad Worker deploy means 100% of users are locked out. Always test after updating:
```
curl -s -o /dev/null -w "%{http_code}" https://eventpilot.tresconglobal.com/login  # must be 200
curl -s -o /dev/null -w "%{http_code}" https://eventpilot.tresconglobal.com/api/auth/microsoft  # must be 307
```

**11. The Worker must forward `x-forwarded-host` correctly.**
The Worker sets `x-forwarded-host: eventpilot.tresconglobal.com` on all proxied requests. This is what allows Next.js to know the public hostname. Don't remove this header.

---

### Current Infrastructure Map (as of 17 Jun 2026)

```
Browser → eventpilot.tresconglobal.com
            │
            ▼ (Cloudflare DNS, proxied)
         Cloudflare Worker: eventpilot-proxy
            │
            ▼ (x-vercel-protection-bypass header added)
         Vercel: eventpilot-trescons-projects.vercel.app
            │
            ▼ (Next.js 16, App Router)
         Supabase: yuyxfxoevztugtfgduks
```

SSO flow:
```
1. /api/auth/microsoft  →  sets sso_state cookie  →  307 to Microsoft (redirect_uri = eventpilot.tresconglobal.com/api/auth/callback)
2. Microsoft authenticates user  →  redirects to eventpilot.tresconglobal.com/api/auth/callback
3. /api/auth/callback  →  verifies state cookie  →  exchanges code  →  looks up staff  →  sets tcs_session cookie  →  redirects to /admin or /dashboard (all on eventpilot.tresconglobal.com)
```

---

## What Was Built This Session (16 Jun 2026 — Durga, Session 2)

### Internal Messaging System
- `supabase/messages_migration.sql` — `messages` table (id, from_id, from_name, to_id, to_name, body, read, created_at) + 3 indexes (to, from, thread). Also adds `from_staff_id TEXT` column to `notifications` table. **SQL run ✅**
- `app/api/messages/route.ts` — GET `?with=<partner_id>` fetches thread + marks incoming as read; POST `{ to_id, body }` sends message + creates bell notification with `from_staff_id`; PATCH `?with=<partner_id>` marks thread read
- `app/api/messages/inbox/route.ts` — GET returns one entry per conversation: partner info, last message, unread count (collapses last 500 messages in JS)
- `app/messages/page.tsx` — Split-panel messaging UI: 300px left inbox + thread panel. Avatar initials with hash colour, unread badge, date separators, sent (teal/right) vs received (gray/left) bubbles, auto-scroll, 8s thread polling. Compose modal: staff search + list with avatars. `?with=<partner_id>` URL param auto-opens thread
- `app/api/notifications/route.ts` — Added `from_staff_id` to SELECT so bell can link to message sender's thread
- `app/components/NavBar.tsx NotificationBell` — Message notifications (type=`message`) now show blue icon + "View message" link → `/messages?with=${from_staff_id}`
- `app/components/PlatformMenu.tsx` — "Messages" entry added to Learning section (blue, `/messages?id=...`)
- `app/dashboard/page.tsx` — "Messages" tile added to Platform Access grid for all staff

### Button Overlap Fix
- `app/components/ReviewWidget.tsx` — Moved "Report Issue" floating button from `bottom-right (24,24)` → `bottom-left (28,28)`. Talk to Pilot stays bottom-right. No more overlap on the dashboard or any other page.

---

## What Was Built This Session (16 Jun 2026 — Durga, QA Sprint)

### Team QA Reviews — 6 Issues Fixed

#### Issue #1–3 (earlier session, now resolved)
- Fixes from team QA carried over from previous session (see prior git commits)

#### Issue #4 — Brand Standards: Event Date, Venue & Tagline (Prashant)
- `app/admin/events/[id]/brand/page.tsx` — Added 11th tab "Event Standards" with date format grid (5 presets + custom + live preview), venue format grid, tagline case/weight radios, placement notes, sample layout reference image uploads (portrait/landscape/square), general notes
- `app/api/events/brand/route.ts` — Added `event_standards` to ALLOWED columns whitelist
- `supabase/event_standards_migration.sql` — `ADD COLUMN event_standards JSONB` — **SQL run ✅**

#### Issue #5 — Template Preview URLs (Prashant)
- `app/api/templates/route.ts` — Added `live_preview_url` field to `TemplateInfo` type, `dbRowToTemplate`, fallback templates, and POST upsert
- `app/api/templates/generate/route.ts` — Updated TemplateInfo construction to include `live_preview_url`
- `app/admin/templates/page.tsx` — Added "Live Preview URL" input to the Add/Edit Template form; "Preview" button appears on template cards when URL is set
- `app/admin/events/[id]/website/page.tsx` — Template cards now show "Preview Live Site" button (opens new tab, stops click propagation so card isn't selected)
- `supabase/live_preview_url_migration.sql` — `ADD COLUMN live_preview_url TEXT` — **SQL run ✅**
- After SQL: go to `/admin/templates`, edit each template, paste its live URL

#### Issue #6 — AIRS Improvements + Community (Karthik)
- `app/lib/airs.ts` — Added `breakdownAIRS()` returning `{ avg, base, courseBonus, cappedBonus, total, courseDetails }`. Added `DEPT_USE_CASES` map with 5 practical AI use cases per department (10 depts)
- `app/dashboard/page.tsx` — Score breakdown panel: visual progress bars for base (0–75) + course bonus (0–25), lists each completed course with tier points. AI use cases card: dept-specific, 5 cards, tool tags, "Share yours" CTA
- `app/community/page.tsx` — NEW page: staff post prompts / use cases / automations / tips. Like button (heart), category + dept filters, form with category picker, body, optional tool name
- `app/api/community/route.ts` — GET (with category/dept/limit/offset filters), POST (create), PATCH (toggle like with `community_likes` double-like prevention)
- `app/components/PlatformMenu.tsx` — Added "AI Community" entry in the Learning section
- `supabase/community_posts_migration.sql` — `community_posts` + `community_likes` tables + RPC functions — **SQL run ✅**

---

## What Was Built This Session (15 Jun 2026 — Madhu, Session 2)

### Website Builder & Toolkit Access Fix
- **Root cause**: After the security fix (previous session) removed admin rights for `office_head` job level, Prashant and Khalifa lost access to the Website Builder because `/admin/toolkit` and `/admin/events/[id]/website` were blocked by middleware for non-admins.
- `middleware.ts` — `/admin/toolkit` and `/admin/events/[id]/(website|brand|market-intel)` are now **auth-only** (not admin-only). All other `/admin/*` routes remain admin-gated.
- `app/admin/events/[id]/website/page.tsx` — Added grant guard: calls `/api/toolkit-access` on mount; redirects to `/dashboard` if user lacks `website_builder` grant.
- `app/admin/events/[id]/market-intel/page.tsx` — Same pattern; checks `intelligence` grant.
- `app/admin/events/[id]/brand/page.tsx` — Same pattern; checks `brand_studio` grant.
- Admins are unaffected (`grants === null` → full access).

### Khalifa Invite Resent
- Sent "Your EventPilot access is ready" invite to `khalifa@tresconglobal.com` (Course Library + Website Builder). The original rollout email was not delivered to him.

---

## What Was Built This Session (15 Jun 2026 — Madhu)

### Assessment Retake
- `app/api/auth/callback/route.ts` — SSO login now redirects non-admin users with `profile_complete = false` to `/profile` (pre-filled with id/name/dept) on every login, until they complete the assessment. Admins are unaffected.
- `app/profile/page.tsx` — Added "Skip for now" link on the welcome screen (shown when `next` param is present). "Save & Exit" button in the interview now goes to `next` URL instead of `/login`; label changes to "Skip for now".
- `app/dashboard/page.tsx` — Orange banner ("Your AI Readiness Score isn't set yet") shown when `profile_complete = false`. "Retake Assessment / Take Assessment" pill button added inline with the AIRS score and Foundation Track badges. Added `profile_complete?` to `StaffMember` type.

### Security Fix — Admin Access
- `app/api/auth/callback/route.ts` + `app/api/login/route.ts` — `isAdmin` was incorrectly set for any user with `job_level === 'office_head'` (an HRMS org rank). This gave Roy, Khalifa, Mithun, Naveen, Andrew, Praveen, and Suresh full admin access. Fixed: admin access now comes **only** from `access_roles` containing `admin` or `super_admin`. Madhu (`md@`) and Durga (`dc@`) unaffected — both have explicit admin roles.

### Staff Access & Invites
- Enabled and sent access invite to `roy@tresconglobal.com` (course only).
- Sent missed invite emails to 5 staff who had `access_enabled = true` but never received the rollout email: Karthik C, Imran Mushtaq, Simran Arora, Nicholas Nunes (Course Library + Website Builder), Utkarsh Pant.

### exitlite Skill Fix
- `/Users/madhu/.claude/skills/exitlite/skill.md` — Removed hardcoded Lead Finder references. Skill now detects the current project from the working directory and applies the exit procedure to that project.

---

## What Was Built This Session (15 Jun 2026 — Durga, Session 5)

### Build Log Fixes
- `.github/scripts/enrich-commit.js` — Added noise patterns for `chore: sync`, `chore: lock`, `trigger redeploy`. Added empty-diff guard: skips Gemini enrichment if no code files changed. Added rule to Gemini prompt: "Only describe what is visible in the diff — do not invent features."
- `enrich-commit.js` + `app/api/build-log/route.ts` — `resolveAuthor()` now maps `reachcharan@gmail.com` and `nammadaiva-agent` to **Durga** in both the GitHub Action and the live build-log API.
- Supabase `build_log_enriched` — deleted 2 hallucinated rows (fake "Admin Dashboard" entry on empty sync commit; over-interpreted "Team Dashboard" row). Updated all `author_name = 'nammadaiva-agent'` rows to `'Durga'`.

### Platform Sync — Both Vercel Projects Caught Up
- `taos-discovery.vercel.app` (nammadaiva Vercel) was 3 commits behind after Madhu pushed directly from his machine. Triggered manual redeploy via Vercel CLI — now fully in sync with `Trescon-Events/eventpilot` main.
- Confirmed: `eventpilot.tresconglobal.com` auto-deploys from the same GitHub repo and was already current.

### Domain / Stale URL Cleanup (earlier this session)
- `middleware.ts` — Added `taos-discovery.vercel.app` to `PLATFORM_HOSTS` (was missing; middleware was misidentifying it as a custom event domain).
- `app/api/forgot-password/route.ts` + `app/api/hr/staff/route.ts` — Replaced hardcoded `eventpilot-trescons-projects.vercel.app` fallback with `eventpilot.tresconglobal.com`.
- `app/api/events/cloudflare/route.ts` — `VERCEL_HOST` now reads from `VERCEL_PROJECT_PRODUCTION_URL` env var; falls back to `cname.vercel-dns.com`.

### Review Widget — Screenshot Upload (earlier this session)
- `app/components/ReviewWidget.tsx` — Screenshot attachment: dashed upload zone, image preview with remove button, validates image type + 5 MB limit.
- `app/api/reviews/upload/route.ts` — NEW. Accepts image, auto-creates `reviews` Supabase Storage bucket, uploads, returns public URL.
- `app/api/reviews/route.ts` — POST now stores `screenshot_url`.
- `app/admin/reviews/page.tsx` — Expanded card shows screenshot thumbnail (click to open full size).
- `supabase/platform_reviews_screenshot.sql` — `ADD COLUMN IF NOT EXISTS screenshot_url TEXT` — already run.

---

## What Was Built This Session (15 Jun 2026 — Durga)

### Auto Build Log — GitHub Action + Gemini
- `.github/workflows/enrich-commits.yml` + `.github/scripts/enrich-commit.js` — GitHub Action runs on every push to main, reads commit diff, sends to Gemini 2.5 Flash, stores AI-written title + bullets in `build_log_enriched` Supabase table
- `app/api/build-log/route.ts` — updated to read from enriched table first, falls back to GitHub API
- `supabase/build_log_enriched.sql` — new table created in Event Pilot Supabase (`yuyxfxoevztugtfgduks`)
- GitHub secrets set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`
- `scripts/backfill-build-log.js` — one-time script, ran locally, backfilled 74 commits (7 days of history)
- What's Next panel now shows full day-wise build history with no manual effort
- Build log groups now sorted by most recent push time (most recent author always shown first)
- Push time now displayed in each badge: e.g. "15 Jun 2026 · 02:16 PM — Durga"

### Smart Data — 100% Complete
All missing features built and deployed:

- `app/data/pipeline/page.tsx` — Pipeline Kanban board: 6 stages (Prospect → Contacted → Interested → Confirmed → Declined → Vendor), drag-drop cards, click-to-move menu, contact name/title/email shown per card
- `app/api/data/enrich/email-guess/route.ts` — Email Guesser API wired to Apollo `people/match`; fallback pattern generator when no API key; returns confidence + verified status
- `app/data/quality/page.tsx` + `app/api/data/quality/route.ts` — Data Quality dashboard: field completeness bars, monthly trend chart, duplicate detection, overall score ring
- `app/data/audiences/page.tsx` + `app/api/data/audiences/route.ts` — Saved Audiences: create named ICP definitions from JSON, view, delete; GET/POST/DELETE API on `sd_saved_audiences`
- `app/data/scoring/page.tsx` — Contact Scoring: search contact, enter event context, run Gemini research brief, shows fit score ring, brief, opening line, reasons, flags
- `app/data/audit/page.tsx` + `app/api/data/audit/route.ts` — Enrichment Audit: field-level change log across all contacts, filterable by tool, shows contact name + old/new values
- `app/api/data/credits/route.ts` — Credits API: today's lookup usage + tool statuses
- `app/data/layout.tsx` — Sidebar updated: live credit bar (usage/limit with progress bar), Pipeline section added, Enrichment Audit under DATABASE, Saved Audiences + Contact Scoring + Data Quality under INTELLIGENCE
- `supabase/smartdata_patch_jun2026.sql` — SQL for `sd_saved_audiences`, `sd_contact_scores`, missing indexes (run in SmartData Supabase `lnhtmppybqeicedgtanf`)

### Staff Review System (built earlier this session)
- `app/components/ReviewWidget.tsx` — floating "Report Issue" button, session-gated (hides when not logged in), full light theme
- `app/admin/reviews/page.tsx` — admin triage page with light platform theme, status filters, admin notes
- `app/api/reviews/route.ts` + `app/api/reviews/[id]/route.ts` — GET/POST/PATCH review APIs
- `supabase/platform_reviews.sql` — `platform_reviews` table with severity, status, tool, admin_notes (already run)
- Added Staff Reviews link to admin nav

---

## What Durga Built Previously (retained, not changed)

Everything committed before `dc48b2b` is Durga's work and was not touched. Key pieces:

- Full platform rebrand: Trescademy → Event Pilot, all UI/nav/email/SQL/docs updated
- Org Chart: Directory table + Hierarchy view, reporting chain, tool access toggles per person
- Tool Permissions: 8 platform modules, per-staff drawer, Bulk Grant, inline dot badges
- Staff Directory (/hr/staff) + Staff Onboarding Wizard (5-step HR form)
- Password management: forgot, reset, forced first-login change, self-service, admin force-reset
- Transactional emails via Resend from noreply@eventpilot.tresconglobal.com
- Full HRMS: attendance, leave, recruitment pipeline, contracts, payroll grades, onboarding
- My HR portal: self-service leave, attendance, event tasks for all staff
- Events Hub: RACI, P&L, execution flow, checklist, deals, team management
- Brand Studio v2: 9-section brand book builder, PDF import, AI extraction, manual builder
- Website Builder: event microsites, brand sync gate, template library (5 templates)
- Brand asset generator (Imagen 3), brand PDF export
- Smart Data: lead extraction, enrichment, email verification, contact DB
- Content Hub: AI social campaigns, approval flow, guided templates
- Course Library, Course Assignment, Completion Certificates
- Course Builder (/admin/courses): Review Queue, All Courses table, editor, new course form
- Department course seeding, weekly auto course generation (Sundays), org pulse email
- Team Dashboard, role-personalized dashboards, platform docs (20 articles)
- Knowledge Base: Gemini-powered PDF processing
- Weekly HRMS sync confirmed end-to-end: 124 staff, 51 projects, 349 allocations

---

## What Was Built This Session (15 Jun 2026 — Session 4 — Durga)

### Review Widget — Screenshot Upload
- `app/components/ReviewWidget.tsx` — Added screenshot attachment field: dashed upload zone, image preview with remove button, file validated (image only, max 5 MB)
- `app/api/reviews/upload/route.ts` — NEW. POST endpoint: accepts image file, auto-creates `reviews` Supabase Storage bucket if missing, uploads file, returns public URL
- `app/api/reviews/route.ts` — POST now accepts and stores `screenshot_url`
- `app/admin/reviews/page.tsx` — Expanded card now shows screenshot thumbnail (click to open full size)
- `supabase/platform_reviews_screenshot.sql` — `ALTER TABLE platform_reviews ADD COLUMN IF NOT EXISTS screenshot_url TEXT` — **run this in Event Pilot Supabase (`yuyxfxoevztugtfgduks`) before deploying**

### Context from Madhu (15 Jun 2026)
- Madhu added a retake assessment button (pushed to main)
- Fouzan assigned to coordinate selected staff to take assessment and complete courses + collect feedback
- Smart Data still pending for Madhu (no API keys set yet)
- Review Management System confirmed by Madhu — screenshot upload requested

---

## What Was Built This Session (15 Jun 2026 — Session 2 — Madhu)

### Email ID Consolidation — madhu → madhus
- Identified duplicate `staff_members` record created by HRMS sync after email was corrected in HRMS from `madhu@tresconglobal.com` → `madhus@tresconglobal.com`. The sync upserts on `email` as conflict key, so the corrected email created a new row instead of updating the old one.
- Reassigned 3 `event_staff` project allocation records from old ID (`4931f8c6`) to the correct `madhus@` record (`aa1cf0f6`) so no event assignments were lost.
- Deleted the old `madhu@tresconglobal.com` staff_members record. Both records had identical data (profile_complete = false), no data loss.
- Sent a fresh "Your EventPilot access is ready" login email to `madhus@tresconglobal.com` via Resend confirming the updated address and linking to the Microsoft 365 SSO login page.

---

## What Was Built This Session (15 Jun 2026 — Madhu)

### Selective Staff Rollout (DB)
- Enabled `access_enabled = true` for 25 specific staff (courses only) + Prashant, Khalifa, Nicholas (courses + Website Builder). All other staff had access disabled.
- Final state: all 126 staff enabled after user decision to open access to everyone who received the rollout email.
- Website Builder `tool_grants` set for Prashant, Khalifa, Nicholas.

### Rollout Notification Email (`app/lib/email.ts`, `scripts/send-rollout-emails.mjs`)
- New `sendAccessGranted()` email function — branded "You're in" email listing the user's access (Course Library / + Website Builder). Lime green CTA button, login URL.
- Rollout emails sent to all enabled staff.

### SSO-Only Login (`app/login/page.tsx`)
- Removed email/password form, forgot-password panel, and "or" divider entirely.
- Microsoft 365 button is now the sole login option — larger, more prominent.
- SSO error display retained (for OAuth failure redirects).
- Bottom wordmark updated to "Event Pilot · Trescon".

### Access-Pending Gate (`app/access-pending/page.tsx`, `app/api/request-access/route.ts`)
- New `/access-pending` page: shown to any staff member whose `access_enabled = false` after SSO.
- Displays "Platform in testing" message with pre-filled work email and a "Request Access" button.
- POST `/api/request-access` — sends notification email to `md@tresconglobal.com` and `dc@tresconglobal.com` when any staff member requests access.
- New `sendAccessRequest()` function added to `app/lib/email.ts`.

### SSO Callback Update (`app/api/auth/callback/route.ts`)
- `access_enabled = false` now redirects to `/access-pending?email=xxx` instead of the login error page.

### Branding: "Trescon Global" → "Trescon" (34 occurrences)
- Global rename across all `app/` `.ts` and `.tsx` files — API routes, email templates, UI pages, seed files, lib utilities.
- Email footer now reads "Trescon · Event Pilot".

---

## What Was Built This Session (12 Jun 2026 — Madhu)

### DB Migrations (run via pg pooler on aws-1-ap-southeast-1)
- `supabase/missing_columns.sql` — Added `documents.word_count INTEGER DEFAULT 0` and `course_attempts.authenticity_flag BOOLEAN DEFAULT false`. Both columns were missing and causing silent failures / log noise.

### Course Completion API Fix (critical)
- `app/api/course-completion/route.ts` — Was silently failing to write `course_attempts` records when `authenticity_flag` column didn't exist. Fixed with resilient insert (tries with flag, retries without on error). Also added session ownership check: session.sid must match request body `staff_id` → 403 if mismatch.

### Persistent Sessions (30-day)
- `app/api/auth/callback/route.ts` — SSO sessions extended from 8h to 30 days
- `app/api/login/route.ts` — Accepts `rememberMe` bool; 30-day session when true, 8h when false
- `app/login/page.tsx` — "Remember me" checkbox added (default checked)

### Course-Only Staff Rollout
- `app/dashboard/page.tsx` — Removed AIRS assessment gate (was redirecting to /profile when tasks.length === 0, blocking all new staff from courses). Added course-only workspace for regular staff (non-admin, no reports): "My Learning" workspace with Course Library + My HR tiles and course stats (done, mandatory left, total mandatory). Fixed session ownership enforcement in `/api/dashboard`.

### Manager Team View
- `app/api/team-courses/route.ts` — NEW endpoint: GET /api/team-courses?manager_id=X. Returns direct reports with course progress stats. Exposes only work-related fields (name, dept, role, job_level) — zero personal/HRMS data. Session-gated (only manager or admin).
- `app/dashboard/page.tsx` — Added "My Team's Learning" table for managers with reports: name/dept/role, courses done/total, mandatory progress, last active date.

### UI: EventPilot Branding + Profile Menu
- `app/components/NavBar.tsx` — Full rewrite: Logo link now wraps both Trescon logo and "EventPilot / by Trescon" wordmark (both go to dashboard). New `ProfileMenu` self-fetching client component: avatar button → dropdown showing name + role badge + sign-out. `doSignOut()` calls POST /api/auth/logout to clear httpOnly cookie before clearing localStorage. Legacy `SignOutBtn` kept, delegates to `doSignOut()`.
- `app/dashboard/page.tsx`, `app/team/page.tsx`, `app/my-hr/page.tsx` — `SignOutBtn` replaced with `ProfileMenu`.

### Metadata + OG / Favicons
- `app/layout.tsx` — Title: "EventPilot", description: "AI-Powered event management platform for Trescon." Full OG + Twitter card meta. Icons: favicon.png (32×32), favicon-192.png (192×192), apple-touch-icon.png (180×180).
- `public/favicon.png`, `public/favicon-192.png`, `public/apple-touch-icon.png` — Trescon T icon pulled from tresconglobal.com.
- `public/og-image.png` — 1024×600 Trescon feature image for link previews.

### HRMS Sync
- Triggered fresh sync: 122 staff, 51 projects, 351 allocations, 417 project roles synced.

### Known Issues (arch notes updated)
- Session cookie maxAge updated to 30d — sessions in `tcs_session` cookie are now 30-day by default for SSO, opt-in 30-day for password login.

---

## What Was Built This Session (11 Jun 2026 — Madhu)

### Microsoft 365 SSO
- `app/api/auth/microsoft/route.ts` — OAuth initiation (CSRF state, redirect to Entra ID)
- `app/api/auth/callback/route.ts` — OAuth callback, token exchange, session creation
- `app/login/page.tsx` — "Sign in with Microsoft 365" button added; SSO error display
- Azure App: client ID `1eb65a1b-849d-414f-88f4-e0faf812fbfc`, tenant `932ae9a0-7b21-4cbe-8f11-cc53d1d3d722`
- `.env.local` — MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID set (also in Vercel)
- Session cookie (`tcs_session`) payload now includes `roles: string[]`
- Admin secondary gate bypassed for SSO — `app/admin/page.tsx` reads `/api/auth/session` on mount

### Access Roles System
- Supabase migration run: `access_roles TEXT[] NOT NULL DEFAULT ARRAY['standard']` on staff_members
- `app/api/login/route.ts` — admin check now also looks at access_roles for 'admin'/'super_admin'
- `middleware.ts` — session type extended with `roles?: string[]`; HR gating uses roles
- `app/api/hrms-sync/route.ts` — pulls `user_roles` + `project_roles` from HRMS; syncs to staff_members.access_roles and event_staff columns
- `app/api/cron/hrms-sync/route.ts` — same additions + fixed `deriveJobLevel()` bug (was always 'staff')
- `app/api/staff-roles/route.ts` — NEW: PATCH endpoint to manually override a staff member's roles
- `app/api/staff-list/route.ts` — added `access_roles` to list query

### User Management UI
- `app/admin/page.tsx` — colored role badge pills per staff row; Roles modal with 6 checkboxes; ROLE_META constant; SSO auto-auth useEffect

### Onboarding Flow
- Removed forced onboarding redirect from `app/login/page.tsx` and `app/api/auth/callback/route.ts`
- Skip + "Don't ask again" option added (staff can take assessment from inside the app)

### Toolkit Per-Tool Access Grants
- Supabase: `tool_grants` JSONB column on staff_members (was already there from Durga's tool permissions work)
- SQL run directly: Khalifa → `{"website_builder": true}`, Prashant → `{"website_builder": true, "intelligence": true, "content": true}`
- `app/api/toolkit-access/route.ts` — now returns `{ access: bool, grants: Record<string,bool> | null }` (null = admin, show all)
- `app/admin/toolkit/page.tsx` — `TOOL_GRANT_KEY` map added; `visibleTools` computed from grants; sidebar categories hidden when empty

---

## Grant Key Mapping (toolkit)

| Tool ID         | Grant Key        | Notes              |
|-----------------|------------------|--------------------|
| website-builder | website_builder  |                    |
| market-intel    | intelligence     |                    |
| brand-studio    | brand_studio     |                    |
| smart-data      | smart_data       |                    |
| outreach        | content          | route is /content  |
| course-builder  | null             | admin only         |
| tresagent       | null             | admin only         |

---

## Pre-Phase 3 Checklist

| # | Item                                     | Status      |
|---|------------------------------------------|-------------|
| 1 | Microsoft 365 SSO                        | ✅ Done      |
| 2 | User Management + Access Roles           | ✅ Done      |
| 3 | Khalifa — brand book test (WB for AI2047)| ⏳ Pending   |
| 4 | Prashant + Khalifa — WB test for AI2047  | ⏳ Pending   |
| 5 | Social media manager for AI2047          | ⏳ Phase 3   |

---

## Known Minor Issues

- `scripts/check-hrms-schema.ts` and `scripts/set-super-admins.ts` — untracked scripts in .gitignore, safe to leave or delete locally

---

## Architecture Notes (for next builder)

- **Session cookie**: `tcs_session` = base64(JSON({sid, jl, adm, dept, roles})), httpOnly, 30d (SSO always; password login when rememberMe=true; 8h otherwise)
- **job_level values**: staff, team_lead, dept_head, office_head, super_admin
- **access_roles values**: standard, hr, project_manager, project_director, admin, super_admin
- **Admin check**: `adm: true` in session = has admin access to /admin routes
- **HRMS sync is a temporary bridge** — EventPilot is designed to eventually replace HRMS and SmartData entirely. Don't build deep dependencies on HRMS sync existing. Design natively.
- **Platform vision**: HRMS + SmartData will be migrated INTO EventPilot. Build as if EventPilot is the master.
- **Port**: EventPilot dev server runs on port 3003 (set in package.json)
- **Supabase project**: yuyxfxoevztugtfgduks (main EventPilot DB)
- **Railway project**: Trescon's Projects / eventpilot → https://eventpilot-production-90c6.up.railway.app (proxied via Cloudflare Worker → eventpilot.tresconglobal.com)

---

## What's Next

> **⚠️ Before doing anything:** Read the **Incident Report** section above. It documents the SSO outage, what caused it, and 11 safety rules that must be followed for any hosting, Cloudflare, or Vercel work. If you are Durga's Claude — you must read it in full before touching anything related to deployment.

---

### Immediate (tell Fouzan now)
- Assessment + AIRS score is fully fixed and live. Staff can retry their welcome email link. Score shows correctly on the admin dashboard after this session.

### Sprint Items

1. **Durga / Madhu — take the assessment** — Both Durga Charan accounts and Madhukar Dudda have `profile_complete = true` but NO responses in `staff_task_profiles`. Their scores show 0. They need to submit the questionnaire via `/profile?id=<their-id>`.

2. **Template live preview URLs** — Go to `/admin/templates`, edit each of the 5 templates, paste in the deployed site URL so "Preview Live Site" appears in the builder.

3. **Hands-on AI assignments** — staff submit real AI workflows they've built. Needs new DB table + admin review queue. Deferred to next sprint.

4. **Khalifa + Prashant — Website Builder test for AI2047** — middleware fix deployed, invite sent to Khalifa. Run the full test and confirm WB works end-to-end.

5. **Content Hub social publishing** — approval queue is built, needs Meta API tokens from Madhu to go live.

6. **Security hardening Phase 3** — rate limiting, audit log, signed sessions, idle timeout. Need Bangalore + Dubai office IPs first.

7. **Monitor access request emails** — staff without access sends request to md@ and dc@.

8. **Messaging** — live and tested. Monitor usage; next iteration: read receipts or file attachments if requested.

### Deploy reminder
`git push origin main` → Railway auto-deploys in ~3 min. No CLI needed.

## Smart Data — Notes for Madhu

All routes are live. To activate paid enrichment tools, add the API keys in two places: Railway (project → eventpilot service → Variables tab) AND `.env.local` for local use:
- `LUSHA_API_KEY` — LinkedIn Enricher + Smart Lookup
- `APOLLO_API_KEY` — Email Guesser + Lead Finder execute
- `MILLION_VERIFIER_API_KEY` — Email Verifier
- `FIRECRAWL_API_KEY` — Website Finder + URL Extractor

SmartData SQL patch (`supabase/smartdata_patch_jun2026.sql`) must be run in `lnhtmppybqeicedgtanf` project.

---

## Handoff Sign-off Checklist

Before signing off, confirm:
- [ ] HANDOFF.md updated with everything built this session
- [ ] Build Log in `app/admin/page.tsx` updated with new entries
- [ ] All changes committed and pushed to main
- [ ] Railway deployment verified (check https://eventpilot.tresconglobal.com after ~3 min)
- [ ] "Handed off to" field updated above
