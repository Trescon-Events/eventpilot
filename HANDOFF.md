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

| Field       | Value                                                   |
|-------------|---------------------------------------------------------|
| Who         | Madhu + Claude Code (Sonnet 4.6)                        |
| Date        | 2026-06-15                                              |
| Handed off to | Durga                                                 |
| Deployed    | Yes — https://eventpilot.tresconglobal.com (Vercel, trescons-projects/eventpilot) |

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
- **Port**: EventPilot dev server runs on port 3000 (hardcoded in package.json)
- **Supabase project**: yuyxfxoevztugtfgduks (main EventPilot DB)
- **Vercel project**: trescons-projects/eventpilot → https://eventpilot.tresconglobal.com

---

## What's Next

1. Test Khalifa's Website Builder access for AI2047 brand book
2. Test Prashant + Khalifa website builder for AI2047
3. Social media manager for AI2047 (Phase 3 proper — needs Meta API tokens from Madhu)
4. Content Hub social publishing — approval queue built, needs Meta tokens
5. Security hardening (Phase 3): rate limiting, audit log, signed sessions, idle timeout
6. Monitor access request emails — any staff who tries to log in without access will send a request to md@ and dc@

---

## Handoff Sign-off Checklist

Before signing off, confirm:
- [ ] HANDOFF.md updated with everything built this session
- [ ] Build Log in `app/admin/page.tsx` updated with new entries
- [ ] All changes committed and pushed to main
- [ ] Vercel deployment verified (check https://eventpilot.tresconglobal.com)
- [ ] "Handed off to" field updated above
