# EventPilot Task Manager (`eventpilot-task-manager`) — Handoff (Madhu ↔ Khalifa)

Read this before starting a new session on the Task Manager module — whether
you're Madhu picking it back up, or Khalifa working on it from his own
machine. This is scoped to this module only; the platform-wide `HANDOFF.md`
covers EventPilot in general and is not duplicated here.

**Project Name:** `eventpilot-task-manager`  
**Last updated:** 2026-09-01, by Madhu (with Claude)

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

## What's deliberately NOT built

- Bulk task actions (multi-select reassign/delete) — per-row actions only
- A personal daily-hours goal/progress bar (TaskSphere had one) — skipped
  as individual gamification, not core task management
- Mobile-optimized layouts — matches the rest of EventPilot's admin surface

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
