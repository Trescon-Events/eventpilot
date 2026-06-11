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
| Date        | 2026-06-11                                              |
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

- `column documents.word_count does not exist` — appears in logs, needs a DB migration to add the column
- `scripts/check-hrms-schema.ts` and `scripts/set-super-admins.ts` — untracked scripts, clean up or add to .gitignore

---

## Architecture Notes (for next builder)

- **Session cookie**: `tcs_session` = base64(JSON({sid, jl, adm, dept, roles})), httpOnly, 8hr
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

1. Fix `documents.word_count` DB column (minor migration)
2. Test Khalifa's Website Builder access for AI2047 brand book
3. Test Prashant + Khalifa website builder for AI2047
4. Social media manager for AI2047 (Phase 3 proper — needs Meta API tokens from Madhu)
5. Content Hub social publishing — approval queue built, needs Meta tokens
6. Security hardening (Phase 3): rate limiting, audit log, signed sessions, idle timeout

---

## Handoff Sign-off Checklist

Before signing off, confirm:
- [ ] HANDOFF.md updated with everything built this session
- [ ] Build Log in `app/admin/page.tsx` updated with new entries
- [ ] All changes committed and pushed to main
- [ ] Vercel deployment verified (check https://eventpilot.tresconglobal.com)
- [ ] "Handed off to" field updated above
