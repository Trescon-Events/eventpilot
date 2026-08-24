# Task Manager module — read before working here

Before making any change under `app/api/task-manager/` or `app/admin/task-manager/`,
read `/TASK_MANAGER_HANDOFF.md` at the repo root. It covers the access
model, why this path is deliberately isolated from the rest of EventPilot
(it's what makes your PRs auto-classify SAFE), known gotchas, and the
contribution workflow (PR against `main`, CI review, Madhu's approval).

The repo root also has its own `AGENTS.md` / `CLAUDE.md` with EventPilot-wide
conventions (Next.js version quirks, build/deploy flow) — read that too if
this is a fresh session.
