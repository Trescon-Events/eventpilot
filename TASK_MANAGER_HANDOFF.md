# EventPilot Task Manager (`eventpilot-task-manager`) — Handoff (Madhu ↔ Khalifa)

Read this before starting a new session on the Task Manager module — whether
you're Madhu picking it back up, or Khalifa working on it from his own
machine. This is scoped to this module only; the platform-wide `HANDOFF.md`
covers EventPilot in general and is not duplicated here.

**Project Name:** `eventpilot-task-manager`  
**Last updated:** 2026-09-03, by Madhu (with Claude)

---

## What this is

A native rebuild of Khalifa's original task system as a proper EventPilot module (`eventpilot-task-manager`) — a shared task
tracker with a per-task timer, table/Kanban views, timesheets, admin oversight console, and automated Microsoft Teams morning overdue task digests with in-Teams direct actionability. Live now at:

**https://eventpilot.tresconglobal.com/admin/task-manager**

## Access model

- **Base module** (`/admin/task-manager`) — open to **every** authenticated
  staff member (`access: { kind: 'always' }` in the registry). No grant
  needed. This was a deliberate call, not an oversight.
- **Admin Console** (`/admin/task-manager/console`) — gated separately by a
  `task_manager_admin` grant. Khalifa has it. He can grant/revoke it for
  anyone else himself, without needing Madhu/Durga, via **Admin Console →
  Manage Access** (`/admin/task-manager/console/access`). This reuses
  EventPilot's existing delegated-admin mechanism (`module_access` table +
  `AccessTab` component) — the same pattern Knowledge Base/DocuHub use.
- **PR Approvals** (`/admin/dev-approvals`) — decision-making (Approve &
  Ship / Send Back) stays restricted to Madhu and Durga, same as always.
  As of 2026-09-01, Khalifa (`khalifa@tresconglobal.com`) has **view-only**
  access to the same page — he can see whether his PR is pending, approved,
  or sent back, and read any "Send Back" note directly there, without
  waiting on an email. The Approve/Send Back buttons and the underlying API
  routes are still hard-blocked for him server-side
  (`app/lib/github/dev-approvals-access.ts`).
- **Vendor accounts** (new 2026-09-02) — external agencies (Cactus, Pixelate)
  get their own EventPilot login via a shared Microsoft 365 mailbox
  (`cactus@tresconglobal.com`, `pixelate@tresconglobal.com`), restricted to
  an admin-chosen allow-list of modules instead of the normal broad-by-default
  staff access. Managed entirely at `/admin/vendor-accounts` — **this is a
  platform-wide admin surface, Madhu/Durga only, not part of the isolated
  task-manager paths below and not Khalifa's to touch.** What *is* inside
  task-manager's own console (Khalifa's territory): each vendor's **contact
  roster** (`/admin/task-manager/console/vendor-contacts`) — named people at
  an agency sharing one login (e.g. Pixelate's designers), purely a label for
  "who should pick this up," with no login of their own. See
  `supabase/vendor_accounts.sql` for the schema and `app/lib/registry/access.ts`
  `checkAccess()` for the deny-by-default gate vendor sessions get (internal
  staff access is completely unchanged).
- **`/dashboard` used to be a leak for vendor accounts** — found and fixed
  2026-09-03. The sidebar's own filtering (via the registry/`module_access`)
  was correct, but nothing gated the dashboard page or its API route
  themselves, and the "My Events" sidebar link is a hardcoded standalone
  link (not a registry module) so it wasn't covered either. Pixelate could
  log in and still see the full My Dashboard (AI Readiness score, My
  Learning, My HR, Messages). Fixed with a new `app/dashboard/layout.tsx`
  redirect for `session.vt`, a matching check in `GET /api/dashboard`, the
  "My Events" link hidden for vendor sessions, and both login paths sending
  vendor accounts straight to `/admin/task-manager` instead of `/dashboard`.
  If you ever add a new top-level page that isn't a registry module (like
  the old My Events link), remember it needs its own vendor check — it
  won't inherit one for free.

## Where the code lives (and why it's isolated this way)

- Pages: `app/admin/task-manager/**` (includes the Vendor Contacts and Task
  Types admin tabs under `console/`, and `NotificationManager.tsx` /
  `layout.tsx` for the desktop-alert system — all still inside this prefix)
- API: `app/api/task-manager/**` (includes `vendor-contacts/**`,
  `task-types/**`, `notifications/**`)
- Schema: `supabase/task_manager*.sql` (6 files now — apply new ones
  manually via the Supabase Dashboard SQL editor; this repo has no migration
  runner)

These two path prefixes are deliberately **isolated** — Khalifa's PRs that
stay confined to them get auto-classified `SAFE` by the CI pipeline (see
below). Touching anything outside them (shared registry, middleware, email
templates, etc.) will always classify `REVIEW_CLOSELY`, which is correct —
those files affect the rest of EventPilot and deserve a closer look
regardless of who's changing them.

**Not part of this isolation, even though it's related:** `app/admin/vendor-accounts/**`
and `app/api/vendor-accounts/**` (creating/disabling vendor logins, deciding
which modules they can see) are platform-wide, Madhu/Durga only — see
"Access model" above. If you're only ever working inside the two prefixes
above, you'll never need to touch those.

**Also worth knowing (2026-09-02):** a platform-wide auth-hardening pass
touched roughly 50 files *outside* task-manager entirely (bespoke, commercial/P&L,
knowledge base, brand-studio, market-intel, etc.) — several previously had
no server-side access check at all beyond "is there a session," relying on
the page layout as the only gate. If you notice other modules' API routes
got new access checks around this date, that's why — it rode along in the
same commits as the vendor-accounts work (the vendor deny-by-default gate is
what surfaced the gap), but it's unrelated to task-manager feature work.
Don't be alarmed by it showing up in `git log`/`git blame` near this
session's commits.

## Khalifa's contribution workflow — "Go Live"

**One-time setup (skip if already done):** the agent needs the GitHub CLI
installed and authenticated as Khalifa's own GitHub account
(`khalifa-branding`), with push access to `Trescon-Events/eventpilot`:

```
brew install gh
gh auth login    # GitHub.com, HTTPS, log in as khalifa-branding
gh auth status   # confirm it shows Trescon-Events/eventpilot access
```

**The actual workflow — when Khalifa says "Go live" (or similar) to the
agent, the agent does all of this itself. It must not tell him to open
github.com and do it by hand — that manual hand-off is exactly what this
protocol replaces:**

1. Commit any outstanding changes, if not already committed.
2. `git push -u origin <branch-name>` (create the branch first if it's new).
3. Open the PR from the terminal, not the browser:
   `gh pr create --base main --head <branch-name> --title "<concise summary>" --body "<what changed and why>"`
4. Stop there and tell Khalifa the PR is up. Everything after this is
   already automatic — don't try to do any of it yourself:
   - A GitHub Action classifies the diff (SAFE if confined to the isolated
     paths above) and posts it as a PR comment.
   - Madhu gets a direct email (via EventPilot's own Resend setup, not
     dependent on GitHub notification settings) with an AI summary and a
     link straight to `/admin/dev-approvals`.
   - `main` is branch-protected — nothing merges without Madhu's (or
     Durga's) approval there. Khalifa has Write access but cannot push
     directly to `main`.
   - Once approved, EventPilot merges it via the GitHub API and Railway
     auto-deploys — no separate deploy step.
5. Khalifa can check status himself anytime at
   **https://eventpilot.tresconglobal.com/admin/dev-approvals** (view-only
   — see Access model above) instead of waiting for the approval/rejection
   email.

## Known gotchas (read before debugging something that isn't actually broken)

- **Local dev + production build in the same directory**: running
  `npm run build` while a `npm run dev` is pointed at the same folder can
  corrupt Turbopack's `.next` dev cache — every route 404s, including ones
  that definitely work. Fix: kill the dev server, `rm -rf .next`, restart.
  Not a code bug if you hit this.
- **Manual time-entry timezone handling**: the Timesheets "+ Log Time"
  modal converts the typed local date/time to a UTC instant **in the
  browser**, not the server — deliberate, since staff span multiple
  offices (Dubai, Bangalore, ...) and there's no single "business
  timezone" the server could assume correctly.
- **"Workstream" field was requested and explicitly skipped** — there's no
  event-independent workstream list anywhere in EventPilot's schema or the
  HRMS-synced staff data (checked department/business_unit, no match).
  Tasks link to real **Events** only. If a real workstream data source
  shows up later, this is the natural place to add it back.
- **Pushing directly to `main`** sometimes gets blocked by Claude Code's
  own permission classifier regardless of what's been agreed in
  conversation — this is expected for a production deploy, not a bug. The
  human in the loop runs it themselves (or a plain retry sometimes works).
- **`task_type_id` is required on every new task, server-side** — `POST
  /api/task-manager` 400s without it. If you add a new entry point that
  creates tasks (the way `QuickAssignCard.tsx` already does), it needs a
  Task Type picker too, or it'll fail silently-ish with a 400. Values are
  managed at `/admin/task-manager/console/task-types` (add/rename/deactivate/
  reorder) — seeded initially with Web Design, Web Dev, Brochure/Package,
  Proposal, Floorplan, General Graphic Design, Social Video, Regular Video
  Editing, 3D.
- **Desktop assignment notifications only fire while an EventPilot
  task-manager tab is open somewhere** (can be backgrounded/unfocused) —
  this is a deliberate scope decision, not a limitation to "fix." Polling-based
  (`app/admin/task-manager/NotificationManager.tsx`, every ~20-25s, not
  Supabase Realtime — this app has no Supabase-Auth-backed RLS to scope a
  Realtime subscription safely by staff, see the next gotcha), so it won't
  reach someone with the browser fully closed. If that ever needs to change,
  it's a real push-notification build (service worker + VAPID + subscription
  storage), not a small extension of this.
- **Don't copy `app/components/RealtimeNotifications.tsx`'s pattern for
  anything new.** It's a pre-existing, unrelated component (in-app
  notifications/messages, mounted app-wide, not task-manager) that subscribes
  to Supabase Realtime with the anon key filtered client-side by staff ID.
  Investigated 2026-09-02: `notifications`/`messages` have RLS enabled with
  **zero policies**, which — confirmed by live probe, not just reading the
  policy table — currently blocks all Realtime delivery outright. Net effect:
  not a data leak, but that component has likely been silently non-functional
  in production for a while. Out of scope for task-manager, left as-is,
  flagged for whoever owns that feature.

## What's deliberately NOT built

- Bulk task actions (multi-select reassign/delete) — per-row actions only
- A personal daily-hours goal/progress bar (TaskSphere had one) — skipped
  as individual gamification, not core task management
- Mobile-optimized layouts — matches the rest of EventPilot's admin surface
- Per-person time tracking for a shared vendor login (e.g. Pixelate) — the
  contact roster tags *who should pick up* a task, it doesn't split
  timer/timesheet data by individual. Everyone logging in as `pixelate@...`
  still attributes tracked time to that one shared account. Real per-person
  hours from an agency would need individual logins (ruled out — extra
  Microsoft licenses) or a separate self-reported-hours feature.
- True push notifications that work with the browser fully closed — current
  desktop-alert system needs an open (can be backgrounded) EventPilot tab.
  Deliberate scope call 2026-09-02, not a gap to quietly fill later without
  checking — it's a real infrastructure jump (service worker, VAPID, per-staff
  subscription storage).

## Open items / next steps

_(Either of you can add to this list — it's meant to stay current, not a
historical record.)_

- **Khalifa, one-time action needed on your side:** set up the `gh` CLI and
  switch your Antigravity workflow to the new "Go Live" protocol described
  above. Madhu will send you a copy-paste block for Antigravity to walk
  through it — see the "Khalifa's contribution workflow — 'Go Live'"
  section above for the full detail behind it.
- Once you've done a "Go live" for real once, report back whether the PR
  actually appeared in `/admin/dev-approvals` for you (view-only) and
  whether the email flow felt right — this whole path (Go Live wording,
  `gh pr create` from the agent, your view-only access) is new as of
  2026-09-01 and hasn't been exercised end-to-end yet.
- Cactus (`cactus@tresconglobal.com`) and Pixelate (`pixelate@tresconglobal.com`)
  are live as vendor accounts as of 2026-09-02, task-manager granted. Pixelate's
  contact roster (the named people at the agency) needs populating at
  `/admin/task-manager/console/vendor-contacts` as real people come on/off
  the account — that's fair game for Khalifa to maintain day-to-day, it's
  inside his territory.
- `app/components/RealtimeNotifications.tsx` (see gotcha above) is silently
  broken app-wide (unrelated to task-manager) — someone should either fix
  the RLS or decide it's not worth it. Not blocking anything, just sitting
  there doing nothing.

### 2026-09-03 session summary (Madhu, with Claude)

Purpose: Madhu tested logging in as Pixelate and found the vendor
restriction didn't actually hold — the dashboard was still fully
reachable. Fixed the gap (see "Access model" above for the detail):

- `app/dashboard/layout.tsx` (new) — redirects `session.vt` to
  `/admin/task-manager` before any dashboard HTML renders.
- `app/api/dashboard/route.ts` — same check server-side, so hitting the
  API directly with a vendor session also 403s.
- `app/components/nav/AppSidebar.tsx` + `app/lib/nav/NavDataContext.tsx` —
  "My Events" hidden and the sidebar logo link repointed at Task Manager
  for vendor sessions (the module-registry-driven entries were already
  correct; this link wasn't one of them).
- `app/api/auth/callback/route.ts`, `app/api/login/route.ts`,
  `app/login/page.tsx` — both SSO and password login now send vendor
  accounts straight to `/admin/task-manager` instead of `/dashboard`.

Confirmed working against production with Pixelate's own login.

### 2026-09-02 session summary (Madhu, with Claude)

Purpose: onboard two external agencies (Cactus, Pixelate) into task-manager
without giving them EventPilot's normal broad staff access, then two
follow-on feature requests from using it. Changed:

- **Vendor accounts** — new `account_type: 'vendor'` on `staff_members`
  (`supabase/vendor_accounts.sql`), a deny-by-default gate for vendor
  sessions in `checkAccess()` (`app/lib/registry/access.ts`), the
  `/admin/vendor-accounts` platform admin page, and the vendor-contact
  roster inside task-manager's console. Internal-staff access is unchanged.
- **Auth-gap hardening** (rode along, not originally in scope) — ~50 API
  routes across other modules that only checked "is there a session" now
  also enforce their module's real access rule server-side, via a shared
  `app/lib/registry/api-access.ts` helper. See the gotcha above.
- **Task Types** — a required, admin-manageable classification on every
  task (`supabase/task_manager_task_types.sql`,
  `/admin/task-manager/console/task-types`), searchable dropdown in
  `TaskModal`/`QuickAssignCard`. Seeded with the 9 categories listed in the
  gotcha above.
- **Desktop assignment notifications** — polling-based (not Realtime, see
  gotcha above), `assigned_to_changed_at` column + trigger
  (`supabase/task_manager_notifications.sql`) so it only fires on an actual
  reassignment, not any field edit. Click-through opens the task directly
  via `?openTask=<id>`.
- Bigger, more legible "New Task" modal (780px, was 660px).
- Vendor accounts now show up in the default assignee list (previously
  hidden — they have no `department`/`role` set, so the old branding-only
  filter excluded them and required "Show all staff" every time).

### 2026-09-01 session summary (Madhu, with Claude)

Purpose: Khalifa was ending up at "go open a PR on github.com yourself" as
a manual step from Antigravity — this closes that gap so a plain "Go live"
in Antigravity chat is enough, while keeping Madhu (or Durga) as the only
one who can actually merge to `main`. Changed:

- `middleware.ts` — `/admin/dev-approvals` added to the auth-only
  tool-route list (previously blanket-blocked for any non-admin, which
  would have made the view-only grant below unreachable).
- `app/lib/github/dev-approvals-access.ts` — added
  `requireDevApprovalsViewAccess()`; Khalifa (`khalifa@tresconglobal.com`)
  can now `GET` the PR list read-only. `approve`/`reject` still require the
  original, stricter `requireDevApprovalsAccess()` — unchanged, Madhu/Durga
  only.
- `app/admin/dev-approvals/page.tsx` — hides Approve & Ship / Send Back for
  view-only visitors, shows a "view-only" banner, and surfaces the
  Send-Back note in the decided list. Also fixed a pre-existing bug where
  an approved-but-unmerged PR was mislabeled "✓ Merged" (see `HANDOFF.md`).
- This file — rewrote the contribution workflow into the explicit "Go
  Live" protocol above.

## Who to ask

- Access/grants, platform-wide decisions, anything outside the isolated
  paths → **Madhu** (md@tresconglobal.com)
- Day-to-day feature work inside `app/admin/task-manager/` and
  `app/api/task-manager/` → **Khalifa** (khalifa@tresconglobal.com)
