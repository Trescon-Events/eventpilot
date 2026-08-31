# EventPilot Task Manager (`eventpilot-task-manager`) — Handoff (Madhu ↔ Khalifa)

Read this before starting a new session on the Task Manager module — whether
you're Madhu picking it back up, or Khalifa working on it from his own
machine. This is scoped to this module only; the platform-wide `HANDOFF.md`
covers EventPilot in general and is not duplicated here.

**Project Name:** `eventpilot-task-manager`  
**Last updated:** 2026-08-31, by Khalifa

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

## Where the code lives (and why it's isolated this way)

- Pages: `app/admin/task-manager/**`
- API: `app/api/task-manager/**`
- Schema: `supabase/task_manager*.sql` (3 files — apply new ones manually via
  the Supabase Dashboard SQL editor; this repo has no migration runner)

These two path prefixes are deliberately **isolated** — Khalifa's PRs that
stay confined to them get auto-classified `SAFE` by the CI pipeline (see
below). Touching anything outside them (shared registry, middleware, email
templates, etc.) will always classify `REVIEW_CLOSELY`, which is correct —
those files affect the rest of EventPilot and deserve a closer look
regardless of who's changing them.

## Khalifa's contribution workflow

1. Push a branch, open a PR against `main` on `Trescon-Events/eventpilot`
2. A GitHub Action classifies the diff (SAFE if confined to the isolated
   paths above) and posts it as a PR comment
3. Madhu gets a direct email (via EventPilot's own Resend setup, not
   dependent on GitHub notification settings) with the same summary
4. `main` is branch-protected — nothing merges without Madhu's approval on
   GitHub. Khalifa has Write access but cannot push directly to `main`.
5. Once approved + merged, Railway auto-deploys — no separate deploy step

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

## What's deliberately NOT built

- Bulk task actions (multi-select reassign/delete) — per-row actions only
- A personal daily-hours goal/progress bar (TaskSphere had one) — skipped
  as individual gamification, not core task management
- Mobile-optimized layouts — matches the rest of EventPilot's admin surface

## Open items / next steps

_(Either of you can add to this list — it's meant to stay current, not a
historical record.)_

- Nothing currently pending as of this handoff. Both of you should click
  through the live module once and report back anything that feels off.

## Who to ask

- Access/grants, platform-wide decisions, anything outside the isolated
  paths → **Madhu** (md@tresconglobal.com)
- Day-to-day feature work inside `app/admin/task-manager/` and
  `app/api/task-manager/` → **Khalifa** (khalifa@tresconglobal.com)
