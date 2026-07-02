# EventPilot — Session Handoff

> **Claude Code: Read this file at the start of EVERY session before doing any work.**
> Report its contents to the user when starting, so they know the current state.
> Update this file before every sign-off.

---

## Last Session

| Field | Value |
|---|---|
| Who | Durga + Claude Code (Opus 4.7) — evening, Save & Resume foundation across tools (Khalifa review `fcdbcbff`) |
| Latest push | 2026-07-02 evening — Durga/Claude — Save & Resume Phase 1–3 |
| Handed off to | Open |
| Deployed | ✅ Yes — https://eventpilot.tresconglobal.com (Railway auto-deploy from main). ⚠ **Requires one manual SQL step in the Supabase Dashboard before the feature actually works** — see "Follow-up action required" below. |

**Session highlight:** Built the "Resume Work" primitive Khalifa asked for in review `fcdbcbff-53e4-43a5-bbce-0c1cfa3aed3b`. Any staffer who walks away mid-way through a tool now has their draft saved automatically, and a Resume Work sidebar on `/admin/toolkit` surfaces "you were on the Speakers tab for World AI Show Indonesia 3 hours ago" — one click resumes exactly where they left off. Rolled out for the two tools Khalifa is piloting (Website Builder + Brand Studio); other tools slotted into the roadmap.

**Also today (afternoon, Madhu):** Third Pilot Project launched (Website Builder & Brand Studio Module) + admin UI (`/admin/pilots/new`) to replace the script-per-project workflow. Full write-up below.

**Also today (early morning, Durga):** Bespoke Tracker end-to-end unblock — see the "early morning" section further down.

---

## What Was Built — 02 Jul 2026 evening (Durga / Claude Code) — Save & Resume across tools

**Trigger:** Khalifa's review `fcdbcbff-53e4-43a5-bbce-0c1cfa3aed3b`, taken literally: *"any tool that we are working on, we need to have a step-by-step save mode so that at any stage a staff working on a tool has to abort the task for now the tool must save it as a task, and when the staff comes back must have the option for them to restart the task or form or start a new task."*

Not a "Task History" panel, not a global tracker, not multi-device conflict resolution — a save-and-resume primitive that lives inside each tool and surfaces in one Resume Work list on `/admin/toolkit`.

### Phase 1 — Foundation

**New primitives**

- `docs/roadmap-save-resume.md` — scoped roadmap. Tier 1 in-scope now: Website Builder + Brand Studio (Khalifa's pilot). Tier 1 deferred (in roadmap): Market Intel, Bespoke Brief, AI Course Gen, Outreach. Includes the multi-user rule (personal default; opt-in share via `shared_with_team` flag; last-write-wins, no locks) and rollout phases 1–5.
- `supabase/save_resume_migration.sql` — the DDL for the `active_drafts` table (per-user, per-tool, per-event upsert key; two indexes; `NOTIFY pgrst`). **This must be run manually — see follow-up below.**
- `app/api/drafts/route.ts` — `GET` (personal drafts + team-shared from others) and `POST` (upsert on `(user_id, tool_key, event_id)`).
- `app/api/drafts/[id]/route.ts` — `DELETE` and `PATCH` for share-toggle + notes, both owner-gated (admin override).
- `app/lib/useDraft.ts` — React hook every save-resume-capable tool uses. Throttled to one POST per 800 ms so rapid tab-flipping doesn't hammer the endpoint. Returns `{ mine, others, save, discard, shareWithTeam, reload }`.
- `app/components/ResumeSidebar.tsx` — the sidebar section Khalifa asked for. Renders inside the `/admin/toolkit` left rail below the tools list. Empty state, personal drafts, and team-shared drafts (marked "Shared by Firstname"). Click routes directly into the tool + event.
- `app/components/DraftReEntryModal.tsx` — Resume / Start new modal a tool can render on mount when `useDraft().mine` is non-null.

**Wired in**

- `app/admin/toolkit/page.tsx` — mounts `<ResumeSidebar>` in the left rail. `resolveRoute` closes over the existing tool catalogue so the sidebar doesn't need to know which tools take `eventId`.

### Phase 2 — Website Builder integration

- `app/admin/events/[id]/website/page.tsx` — imports `useDraft('website_builder', eventId)` and adds a `useEffect` that pings the registry whenever `tab`, `contentTab`, or `eventName` changes. Status text like "Website Builder · Editing Speakers" so Resume Work shows what the user was doing, not just which tool.

### Phase 3 — Brand Studio integration

- `app/admin/events/[id]/brand/page.tsx` — same shape: `useDraft('brand_studio', eventId)` + a `useEffect` keyed on `tab` + `event?.name`. Status maps against the eleven `TABS` (Identity, Logo, Colors, Typography, …) so Resume shows "Brand Studio · Colors" etc.

### ⚠ Follow-up action required — create the `active_drafts` table

The API route tries to self-heal via `supabaseAdmin.rpc('run_sql', ...)` — but Madhu's afternoon HANDOFF section documents that **`run_sql` doesn't exist in this database** (PGRST202). Same failure Madhu had with `ensureColumns()` in `/api/admin/pilots`. Until the table exists:

- `GET /api/drafts` degrades gracefully → returns `{drafts:[]}` → Resume Work sidebar shows the empty-state message. No crash.
- `POST /api/drafts` returns 500 → the `useDraft` hook silently catches it → tools keep working normally, just no draft is saved.

**Feature is a no-op — but not broken — until the table is created.** To activate:

1. Open Supabase Dashboard → SQL Editor for project `yuyxfxoevztugtfgduks` (dc@tresconglobal.com login)
2. Paste the contents of `supabase/save_resume_migration.sql` and run
3. Verify with `SELECT COUNT(*) FROM active_drafts;` → should return 0

Alternative (per Madhu's flagged approach): `supabase link --project-ref yuyxfxoevztugtfgduks` then `supabase db query --linked "$(cat supabase/save_resume_migration.sql)"` — works from Madhu's machine (Supabase CLI already authenticated to Trescon org there).

### What was validated locally

- Type check clean across the whole surface.
- Dev server on 3007 (something else on 3000) — `GET /api/drafts` and `POST /api/drafts` both `200` with a super-admin cookie and with a synthetic staff UUID. No crashes on the DB path even with the table absent (short-circuits + graceful degradation).

### Multi-user rules (matched to what Khalifa actually asked for)

- Personal by default — every staffer sees only their own drafts unless the owner flips `shared_with_team = true`.
- No approval flow, no locks, no conflict resolution UI — deliberately kept out of Phase 1 to match Khalifa's prompt. Roadmap keeps this cut but documented.
- Share toggle is one PATCH away — surfaces the same draft in teammates' Resume Work lists with an "opt in" tag.

### Reviews addressed this session

| Reporter | Title | Fixed by |
|---|---|---|
| Khalifa Al Marzooqi | Task History / Resume Work | Phase 1 foundation + Phase 2 Website Builder + Phase 3 Brand Studio (pending `active_drafts` table creation) |

---

## What Was Built — 02 Jul 2026 early morning (Durga / Claude Code) — Bespoke Tracker end-to-end unblock

### 🕐 00:31 IST · `06d9f27` — Bespoke create: align events insert column names

`POST /api/bespoke` was inserting into `events` with column names that don't exist on that table. The Supabase error showed the `format` column as missing, but three others were wrong too. Root cause per column:

| Code sent | Actual `events` column | Notes |
|---|---|---|
| `title` | `name` | rename |
| `start_date` | `event_date` | rename |
| `location` | `city` | rename |
| `format` | (doesn't exist) | drop — lives on `bespoke_projects`, inserted next block |

Been broken since 28 Jun; nobody hit it because middleware blocked non-admins from `/admin/bespoke` at all until yesterday's `b5a8376`. Fixes review `bb11a150-40c2-401a-9e64-61fafe320382` (Nicholas Nunes, HIGH severity).

Auto-resolve fired on Railway boot: pushed at 00:31, Railway booted at 02:02:38, review flipped to resolved at 02:02:38, Admin auto-response comment posted at 02:02:48. Nicholas has an in-app notification waiting.

### 🕐 03:55 IST · pg-direct DDL + `2532df9` (docs) — six FK constraints on the lead columns

Even after the events insert was fixed, Nicholas (and Durga during retest) still saw "Project not found" on the detail page. `POST` succeeded and the row was written — the AJMS CXO Boardroom project (id `21fb39f3-5555-453b-b9e6-d88d8396c212`) was created cleanly at 15:30 IST — but the detail page's fetch to `GET /api/bespoke` was 500ing with:

> *"Could not find a relationship between 'bespoke_projects' and 'commercial_lead_id' in the schema cache"*

Root cause: the original `supabase/bespoke_tracker.sql` declared the six lead columns as `REFERENCES staff(id)` — a table that has never existed in this project (the staff table is `staff_members`). The FK constraints were silently never created, so PostgREST's embedded-resource resolver couldn't walk the `commercial_lead:commercial_lead_id ( id, name )` join and the whole query 500'd.

Fix: applied six `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (...) REFERENCES staff_members(id) ON DELETE SET NULL` via pg-direct against the production Supabase, followed by `NOTIFY pgrst, 'reload schema'`. Verified: joined query now returns clean data, AJMS project renders. Migration file `supabase/bespoke_lead_fks.sql` committed as `2532df9` for durability so any fresh environment picks up the same constraints.

### Also this session (non-code)

- **Reviewed Nicholas's "still can't login" concern** — no login issue found. His account is fully operational (`access_enabled`, `is_active`, `profile_complete`, `tool_grants.bespoke: true`, password_hash set). `last_login_at` is null for him but also for every other staff member — that column is not populated platform-wide, so it's not diagnostic. His two reviews yesterday prove he was authenticated then.
- **Drafted the reply to Thulasi's Corporate Marketing Phase 1 scope email** — approves the scope, one flag: reference existing EventPilot data via queries where possible, only create new tables for testimonials + approved images.

### Reviews Closed This Session

| Reporter | Title | Severity | Fixed by |
|---|---|---|---|
| Nicholas Nunes | Issue with creating bespoke project | HIGH | `06d9f27` (events column names) + pg-direct FK migration + `2532df9` (docs) |

---

## What Was Built — 02 Jul 2026 afternoon (Madhu / Claude Code) — Pilot Projects admin tooling

### Part 1 — Website Builder & Brand Studio Module (3rd Pilot Project)

Seeded directly via a one-off script (`scripts/seed-pilot-website-builder.mjs`, gitignored like the other seed scripts): Khalifa (Pilot), Prashant (Co-Pilot — new role), Nicholas (Consulting), Fouzan (Tracking). 15 checklist items across the four, assignment emails sent, `brand_studio` grant added to Khalifa + Prashant (both already had `website_builder`). `PILOTS.md` updated as project #3.

Also shipped: an "Open tool" button at the top of each project card on both `/pilots` and `/admin/pilots` (Bespoke → `/admin/bespoke`, this new project → `/admin/toolkit` as a placeholder since neither Website Builder nor Brand Studio has a standalone page yet), and drag-and-drop + clipboard-paste image upload on the Build Request form's attachment area (reuses the existing multipart upload endpoint — no backend change needed).

### Part 2 — Admin UI to create Pilot Projects (replaces script-per-project)

Prompted by Madhu asking whether future Pilot Projects (including ones for tools that don't exist yet) could be set up from a UI instead of a hand-written script each time. Answer was yes for everything except checklist authoring, which stayed AI-assisted rather than fully automated.

**New surface:** `/admin/pilots/new` — project name/description/status, an optional tool link (label + href, left blank if the tool isn't built yet), repeatable member rows (staff search, role preset picker with a "Custom…" option for new roles + label/color), a tool-grants multi-select per member, a per-member checklist editor, and a "✨ AI-draft checklist" button that drafts all members' checklists in one call.

**New APIs:**
- `POST /api/admin/pilots` — upserts the project (by name) and its members (by project+staff), inserts checklist items only if that project+person has none yet, applies `tool_grants`, and emails assignments. Same session-or-`x-setup-key` auth pattern as `/api/admin/setup-pilots`. Idempotent — safe to re-post.
- `POST /api/admin/pilots/draft-checklist` — Gemini 2.5-flash (`app/lib/pilot-checklist-draft.ts`), given project name/description + members (name + role label), returns a checklist per member mirroring the tone of the three hand-written ones. Admin-only, no `x-setup-key` fallback (browser-only feature).

**Structural change — roles and tool links are now data, not code:**
- `pilot_projects` gained `tool_href`, `tool_label`. `pilot_project_members` gained `role_label`, `role_color`. A new role or a tool going live no longer needs a `.tsx` edit — just a field update.
- `app/pilots/page.tsx` and `app/admin/pilots/page.tsx` read these DB fields first, falling back to the old hardcoded `ROLE_LABELS`/`ROLE_COLORS`/`PROJECT_TOOL_LINK` maps only for rows that predate this (kept as a safety net, not removed).
- `sendPilotAssignment()` (`app/lib/email.ts`) now accepts optional `roleLabel`/`roleNote` overrides so custom roles get a real note instead of falling back to the raw role key.
- Backfilled `tool_href`/`tool_label`/`role_label`/`role_color` for all 3 existing projects by re-posting each to `/api/admin/pilots` with `send_emails:false` — checklist-insert guard skipped re-inserting since items already existed, so this only touched the new columns.

**Deploy hiccups worth knowing about (all fixed):**
1. `middleware.ts` was redirecting unauthenticated `x-setup-key` requests to `/login` before they reached the handler — `/api/admin/pilots` wasn't in `PUBLIC_PREFIXES` like `/api/admin/setup-pilots` is. Fixed by adding it.
2. The DB migration (`ALTER TABLE ... ADD COLUMN`) failed identically from both this machine and Railway with `(ENOTFOUND) tenant/user postgres.yuyxfxoevztugtfgduks not found` against the pooler — not a local-network issue this time, something's off with the pooler for this project specifically. Worth remembering next time a schema change is needed here.
3. Tried routing the migration through the `run_sql` RPC that `app/api/import/commit/route.ts` already calls for dynamic `ALTER TABLE ADD COLUMN` — **that function doesn't exist in this database** (`PGRST202`, function not found). That code's `catch { /* column may already exist */ }` has been silently swallowing this same failure — flagged below as a known issue, not fixed (out of scope this session).
4. What actually worked: `supabase link --project-ref yuyxfxoevztugtfgduks` then `supabase db query --linked "<SQL>"` — routes through the Management API, bypassing the pooler entirely. The Supabase CLI was already authenticated on this machine. `ensureColumns()` in `/api/admin/pilots` still tries the DDL itself on every call (harmless if it fails now that columns exist) but this is the reliable manual fallback if another migration is ever needed here.

### Commits
`682443e` `6c791f3` `ed9456a` `09adff2`

---

## What Was Built — 01 Jul 2026 (Madhu / Claude Code, afternoon) — Build Requests

### `21ec0d5` — Build Requests module (7 files, ~900 lines)

A new module inside Pilot Projects that lets pilots submit build requests to Durga, with file attachments, threaded replies, status lifecycle, email notifications, and auto file cleanup on completion.

**New API routes:**
- `GET/POST /api/build-requests` — list all (admin/CLI) or own (pilot) requests; POST handles multipart form with up to 3 PDF/PNG/JPG files (max 10 MB each); notifies Durga via email on submit
- `GET/PATCH /api/build-requests/[id]` — full request detail with signed file URLs + thread; PATCH is admin-only (session or `x-setup-key`); PATCH auto-deletes files from Supabase Storage when status → `completed`/`deferred`; sends pilot email notification for `needs_clarification`/`completed`/`deferred`
- `POST /api/build-requests/[id]/replies` — pilot reply when status is `needs_clarification`; enforces pilot is submitter; admin can reply via PATCH

**Email functions added to `app/lib/email.ts`:**
- `sendBuildRequestAlert()` — to `dc@tresconglobal.com` on new submission; includes CLI command to review
- `sendBuildRequestUpdate()` — to pilot when Durga updates status to `needs_clarification`/`completed`/`deferred`

**Pages rewritten:**
- `app/pilots/page.tsx` — per-project tabs ("✓ Checklist" | "🔧 Build Requests"); new request form with file picker; expandable rows with full message, signed file links, reply thread; pilot reply input visible only when `status === 'needs_clarification' && submitted_by === me`
- `app/admin/pilots/page.tsx` — same tab structure; expanded detail view; inline "Update Status / Reply" form; CLI curl commands displayed in header

**Middleware:** `/api/build-requests` added to `PUBLIC_PREFIXES` (auth enforced inside)

**Supabase DB tables created (via Management API with PAT):**
- `build_requests` (id, project_id, submitted_by, title, message, status DEFAULT 'submitted', created_at, updated_at)
- `build_request_files` (id, request_id, file_name, storage_path, file_type, file_size_bytes, created_at)
- `build_request_replies` (id, request_id, author_id, is_admin_reply, message, created_at)

**Supabase Storage:** bucket `build-request-files` auto-created on first upload (private, 10 MB limit, PDF/PNG/JPG only)

**Status lifecycle:** `submitted → in_review → needs_clarification ↔ (pilot reply) → in_review → completed | deferred`

**Durga's CLI workflow:**
```bash
# See pending requests
curl "https://eventpilot.tresconglobal.com/api/build-requests?status=submitted" \
  -H "x-setup-key: trescon-weekly-insights-2026"

# Update after completing a build
curl -X PATCH "https://eventpilot.tresconglobal.com/api/build-requests/{id}" \
  -H "x-setup-key: trescon-weekly-insights-2026" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed","reply":"Done. Feature is live at ..."}'
```

**Also fixed this session:**
- `app/api/pilots/checklist/[id]/route.ts` — Next.js 16 breaking change: `params` must be `Promise<{id}>` and awaited (was causing Railway build failure)
- `package.json` — added `@types/pg` as devDependency (TypeScript build was failing)

---

## What Was Built — 01 Jul 2026 evening (Durga / Claude Code) — Weekly Learning Leaderboard

New module: track who is completing AI courses each week, publish a Top-10 leaderboard, email digest every Monday 07:00 IST, and flag staff who have gone silent.

### Data model
- New table `weekly_leaderboard_snapshots` — `(week_start, staff_id, rank, score, completions_count, attempts_count, best_test_score, is_new_completer, streak_weeks, generated_at)` with indexes on `(week_start, rank)` and `(staff_id, week_start DESC)` for the trend view.

### Scoring (`app/lib/leaderboard.ts`)
Pure scoring library — no side effects. Per completion: **100 base + 30 if test_score ≥ 90 + 20 for first-attempt pass + tier bonus (adoption +25 / advanced +50)**. Ties broken by fewer attempts, then earlier last completion. Ranks are dense (ties share position).

Also exports:
- `getEligibleStaff()` — active, non-admin, non-super_admin, attendance-enabled, joined 14+ days before week end
- `computeWeeklyScores()` — reads course_completions in window
- `assignRanks()` — dense ranking with tiebreakers
- `computeStreaks()` — consecutive prior weeks with ≥1 completion
- `findSilentStaff()` — eligible staff with no attempts in the week AND `last_login_at` older than 14 days

### Endpoint & schedule
- `POST/GET /api/cron/generate-leaderboard` — accepts secret via `?secret=` or `Authorization: Bearer`. Query params: `?dryRun=1` (no writes/emails), `?force=1` (regenerate over existing), `?emailOnly=1`, `?weekStart=YYYY-MM-DD`. Idempotent — skips if snapshot for the target week already exists.
- `.github/workflows/weekly-leaderboard.yml` — cron `30 1 * * MON` (01:30 UTC = 07:00 IST). Also supports `workflow_dispatch` with `week_start`, `force`, `dry_run` inputs.

### In-app views
- `GET /api/leaderboard` — returns `{ week_start, week_end, top10, me?, is_admin, total_ranked }`. `me` includes rank + delta + 4-week trend (staff-only, admins get `null`).
- `app/leaderboard/page.tsx` — public leaderboard view. Renders top-10 with per-row delta badges, personal card with rank/delta/mini-trend chart (staff-only), scoring rules footer.

### Email digest (`sendLeaderboardDigest` in `app/lib/email.ts`)
- **Staff email**: personal rank card + top 10 + CTA. Sends to every eligible staff, paced at ~10/sec.
- **Admin email**: same top 10 + full silent-staff list.
- Silent-staff threshold: 14 days (softened for week 1; can tighten later).

### Decisions locked in this session
- **Admins/super_admin excluded from ranking** — they steward the platform, not the leaderboard
- **Top-10 public, personal rank private** — full public ranking too aggressive for early culture
- **14-day silent threshold** — first weeks will show many silent staff (only 13 completions historically); softer threshold reduces noise
- **14-day joiner grace** — new hires never flagged as silent on week 1

### Baseline seeded
Weeks `2026-06-15` (5 rows) and `2026-06-22` (1 row) inserted directly to DB from local (bypassing endpoint, because of the CRON_SECRET issue below). This means the first scheduled fire on **Monday 06 Jul 2026 07:00 IST** for week `2026-06-29 → 2026-07-05` will have a "delta from last week" comparison.

### ⚠️ Blocker before the first automatic fire

The endpoint at `/api/cron/generate-leaderboard` returns **401 Unauthorized** with the CRON_SECRET value in CLAUDE.md (`trescon-weekly-insights-2026`). Confirmed the same happens on `/api/cron/weekly-insights` — same secret pattern, same result. Meaning the `CRON_SECRET` env var on Railway is either unset or a different value. `/api/cron/attendance-live` appears to work only because the "Sync now" button in `/hr/attendance` calls a completely different unauthenticated endpoint (`/api/hr/attendance/sync`) — the 5-min polling is silently 401ing all along, and manual button clicks are what write attendance rows.

**Action required (Durga):**
1. Set `CRON_SECRET` env var on Railway to whatever value should authenticate cron jobs (or confirm the current value)
2. Add the same value as a GitHub Actions repository secret named `CRON_SECRET` under `Trescon-Events/eventpilot → Settings → Secrets and variables → Actions`

Once both are set, run the workflow manually with `dry_run: true` to verify auth passes, then let the Monday 06 Jul schedule fire naturally.

### Commits
- `44f38c8` — feat(leaderboard): weekly learning leaderboard with Monday-morning digest
- `023fc78` — fix(leaderboard): accept secret via query param too

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
- Deleted `vercel.json` (2 crons: `/api/cron/attendance-sync` 01:00 UTC and `/api/cron/hrms-sync` 19:30 UTC — both unnecessary as it turned out; see next bullet)
- Added `.vercelignore` with `*` to skip any lingering Vercel build
- **Not fully fixed** — the GitHub App webhook is still installed on `Trescon-Events/eventpilot` and needs to be uninstalled via Vercel dashboard or GitHub App settings. See Known Issues.
- **Correction on the dead crons**: I initially claimed the sync was dead. On re-check the attendance sync is running — `app/hr/attendance/page.tsx` polls `/api/cron/attendance-live` every 5 minutes while the page is open, and DB shows ~100 staff_attendance rows/day since 17 Jun. `hrms-sync` was always a manual admin button, not a scheduled job.

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
2. **Attendance sync depends on someone having `/hr/attendance` open** — the old Vercel cron (`/api/cron/attendance-sync` daily 01:00 UTC) died with the migration, but sync is not dead — `app/hr/attendance/page.tsx` polls `/api/cron/attendance-live` every 5 minutes while the page is open, and the DB shows consistent ~100 rows/day since 17 Jun. Fragility: on days when nobody opens the page (e.g., weekends), no sync happens — but the next open pulls "last 2 days" so the gap is short. A scheduled fallback (Railway cron or GitHub Actions on schedule) would harden this if needed. `hrms-sync` is intentionally a manual button on `/admin` — not a bug.
3. **Finance pages may still show blank** — session-cookie client-side parse issue. API fallback added twice now (finance pages + RealtimeNotifications) but may not be applied universally. Needs a shared session-reader utility or systemic fix.
4. **Platform Updates ("What's Next")** shows static dev build-log entries — it's a dev changelog, not a user-facing update feed. Needs redesign.
5. **Payroll grades** (L1-EX) are default placeholders — need Trescon's actual grade structure from HR/Madhu.
6. **`middleware.ts` deprecation warning (Next.js 16)** — the "middleware" file convention is deprecated and should be renamed to `proxy`. Non-blocking today but scheduled for removal in a future Next.js. See: https://nextjs.org/docs/messages/middleware-to-proxy
7. **Super-admin Realtime blackout** — RealtimeNotifications.tsx deliberately skips Supabase Realtime for super-admin (no UUID to subscribe with). If Madhu needs live notifications, needs a workaround.
8. **Tracker-role Pilot users only see their own items** — `/api/pilots` filters `visibleItems` to `assigned_to === session.sid` for non-admins. For a `tracking` role user (like Fouzan), the intent of the role is to see everyone's items, not just their own. Design decision needed: should tracking role bypass the per-user filter server-side? Client tracker view already handles read-only for non-owned items.
9. **`supabaseAdmin.rpc('run_sql', ...)` in `app/api/import/commit/route.ts` silently no-ops** — the `run_sql` Postgres function it calls doesn't exist in this database (`PGRST202: function not found`), and the call site wraps it in `catch { /* column may already exist */ }`, so the "add approved new columns" step of the import-commit flow has likely never actually added a column — it just fails quietly every time. Found while debugging an unrelated migration this session (see 02 Jul entry above). Needs either creating the `run_sql` function for real, or replacing that call with the `supabase db query --linked` / Management API approach that worked this session.

---

## What's Next

### Pending — needs Durga action (dashboard only)

1. **Uninstall Vercel GitHub App on `Trescon-Events/eventpilot`** — permanent fix for the residual webhook fires.
2. **(Optional harden)** Add a scheduled fallback for attendance sync — the client-side polling in `/hr/attendance` covers active days, but a Railway cron / GitHub Actions on schedule would cover long stretches when the page isn't opened. Not urgent — sync is currently active.

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

- **02 Jul 2026 — Durga/Claude Opus 4.7 (early hours)** — Bespoke Tracker end-to-end unblock: fixed events insert column names (`06d9f27`), applied six FK constraints via pg-direct + `supabase/bespoke_lead_fks.sql` migration (`2532df9`), drafted Thulasi's scope reply, closed Nicholas's HIGH-severity review with auto-response
- **02 Jul 2026 — Madhu/Claude (afternoon)** — 3rd Pilot Project (Website Builder & Brand Studio Module) + dashboard "Open tool" button + drag-and-drop/paste upload on Build Requests (`0651f8d`); then `/admin/pilots/new` admin UI + AI-draft-checklist for creating future Pilot Projects without a script, with `tool_href`/`role_label`/`role_color` moved from hardcoded maps to DB columns
- **01 Jul 2026 — Madhu/Claude (afternoon)** — Build Requests module: 3 new API routes, 2 new email functions, rewritten `/pilots` + `/admin/pilots` pages, 3 new DB tables, Supabase Storage bucket; fixes Railway build failure (Next.js 16 params + @types/pg)
- **01 Jul 2026 — Durga/Claude (afternoon)** — Assessment module UX v2, Vercel silencer, review auto-response system + 19-comment backfill, Bespoke Tracker access fix, Pilot Projects unresponsive fix, staff-reply auto-reopen removed, **deploy-verified auto-resolve infrastructure**
- **01 Jul 2026 — Madhu** — Pilot Projects launch (10 files, 1,625 lines) + IPv4 DNS series for pg DDL migrations on Railway
- **30 Jun 2026 — Durga (afternoon)** — Messages fixes (staff search, scroll behaviour, inbox sort); Notification sound toggle + session fallback in RealtimeNotifications
- **30 Jun 2026 — Durga (morning)** — Recruitment sample data + Kanban UI, HR Portal dashboard polish, Finance empty-state tables, Salary multi-currency, CRITICAL fixes (`/api/hr/staff` GET + session cookie fallback)
- **29 Jun 2026 — Durga (major session)** — Timesheets, Salary, Performance Reviews, Expense Claims, Vendor Payments, Payroll Summary, Finance Portal, Event Intelligence Brief, real-time notifications (Supabase Realtime + sound + browser push), 5-minute attendance sync. Restructured: Toolkit (6 categories, 14 tools, dark sidebar, collapsible dropdowns), Admin nav bar, Finance/HR separation, Event workspace RACI flow. Fixed: PDF extraction, TypeScript build blocker.
- **28 Jun 2026 — Durga** — Bespoke Tracker full build (3 tables, 3 APIs, 3 pages, 53 auto-generated tasks)
- **26 Jun 2026 — Durga** — Content Engine upgrades, Messaging restored, Dashboard layout fixes, Commercial P&L crash fix
- **25 Jun 2026 — Durga** — Commercial Tracker full BRD implementation (8 tables, 15 APIs, Executive Dashboard + Event Workspace)

---

*This handoff was last updated by Claude Code (Sonnet 5) on 2026-07-02 ~16:20 IST, after Madhu's session that shipped the Pilot Projects admin UI (`09adff2`). All commits pushed to `origin/main`; Railway confirmed live and `/api/admin/pilots` exercised against production for all 3 existing projects. Local main is synced.*
