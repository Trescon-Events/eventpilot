# SmartExcel

Internal, multi-user web app for Trescon: non-technical users run conversational,
AI-assisted spreadsheet & document-to-spreadsheet jobs with a governed execution
loop (clarify → plan → approve → sample → approve → full run → refine). See
`docs/PRD.md` for the full product spec and `docs/PHASE-CHECKLIST.md` for status.

**Lives inside the EventPilot repo, at `tools/smartexcel/`.** No separate
GitHub repo, no separate handoff doc — this is a monorepo subdirectory with its
own toolchain (Vite/Wrangler, not Next.js), excluded from EventPilot's root
`tsconfig.json`/`eslint.config.mjs` so the two don't collide. It's one tool
among several on `eventpilot.tresconglobal.com/admin/toolkit` (alongside
Website Builder, Smart Data, etc.) — same pattern as `tresagent`: a
separately-deployed app opened via a Toolkit card, not a Next.js route. See
"Auth" below. Session history/handoff notes for this tool live in EventPilot's
own root `HANDOFF.md`, not a file here.

## Stack

- **Web app + API:** TanStack Start (full-stack React 19) + Vite, deployed to **Cloudflare Workers** via Wrangler.
- **Database:** **Neon Postgres** via **Drizzle ORM** (HTTP driver — `drizzle-orm/neon-http`).
- **File storage:** Cloudflare **R2** (Phase 1).
- **Job queue:** Cloudflare **Queues** (Phase 1).
- **Heavy processing:** separate **Python worker** (`worker/`, FastAPI + pandas/openpyxl) on Cloud Run or CF Containers — Workers can't run Python data libs.
- **Email:** **Resend** (transactional, e.g. job-run notifications).
- **AI:** **Gemini** / Google AI Studio with tiered model routing (Phase 1).
- **Auth:** SSO-only, bridged from EventPilot — no local password/signup/OTP.
  A staff member clicks "Open SmartExcel" on EventPilot's Toolkit; EventPilot's
  `/api/tools/smart-excel/launch` checks `tool_grants.smart_excel`, mints a
  short-lived HMAC-signed token (staff id/email/name/role), and redirects to
  `/sso?token=...` here. `/sso` verifies the signature + expiry, upserts a local
  `users` row (no password column), and creates the usual DB-backed session
  (httpOnly cookie). See `src/routes/sso.tsx` + `ssoLogin` in
  `src/server/auth.functions.ts`. `/login` is a static "open this from
  EventPilot" page for stray/expired visits — there's no form. Admin vs
  Standard tier is decided on EventPilot's side (`tool_grants.smart_excel_admin`),
  carried in the token, and re-applied on every SSO login (a local role change
  here would just get overwritten next sign-in).

## Commands

```bash
npm run dev         # local dev (vite + tanstack start) on :3000
npm run build       # production build (also generates src/routeTree.gen.ts)
npm run typecheck   # tsc --noEmit (run after a build so routeTree exists)
npm run lint        # eslint
npm run deploy      # build + wrangler deploy

npm run db:generate # generate SQL migration from src/db/schema.ts
npm run db:push     # push schema to the database (dev)
npm run db:migrate  # apply migrations
npm run db:seed     # seed workspace, roles, permissions, Super Admin
npm run db:studio   # drizzle studio
```

## Environment / secrets

Copy `.env.example` → `.dev.vars` (for `wrangler dev`) and/or `.env` (for drizzle-kit/seed).
Set the same as Cloudflare secrets in prod (`wrangler secret put <NAME>`):

- `DATABASE_URL` — Neon pooled/HTTP connection string **(required)**
- `SESSION_SECRET` — random 32+ bytes **(required)**
- `SMARTEXCEL_SSO_SECRET` — random 32+ bytes, **must exactly match** the value of
  the same name set on the EventPilot side (Railway env var) **(required)**.
  Without it, `/sso` can't verify tokens and nobody can sign in.
- `RESEND_API_KEY`, `EMAIL_FROM` — transactional email; without a key, sends are logged, not sent
- `APP_URL` — used for cookie `secure` flag and email links
- `SUPER_ADMIN_EMAIL` — defaults to `md@tresconglobal.com`
- `GEMINI_API_KEY`, `WORKER_SHARED_SECRET` — Phase 1

## Architecture notes

- **File-based routing** under `src/routes/`. `src/routeTree.gen.ts` is auto-generated (gitignored) — don't edit by hand; it appears after `npm run dev`/`build`.
- **Server functions** (RPC) live in `src/server/*.functions.ts` (`createServerFn(...).inputValidator(...).handler(...)`). Auth in `auth.functions.ts`, jobs in `jobs.functions.ts`.
- **DB schema** is the single source of truth at `src/db/schema.ts`; client in `src/db/index.ts`; seed in `src/db/seed.ts`.
- **Auth/session** server-only logic in `src/lib/session.ts` (cookies via `@tanstack/react-start/server`). Only import it from server functions / route `beforeLoad`.
- **Roles & permissions** in `src/lib/roles.ts`. Super Admin (`md@tresconglobal.com`) is permanent, non-revokable, and bypasses all permission checks. Admin/Standard permissions are data-driven (`role_permissions`) and editable from the admin panel.
- **Job lifecycle** state machine in `src/lib/job-states.ts` (PRD §9) — validate transitions centrally.
- **Config** read via `src/lib/env.ts` (`process.env`, works on Workers with `nodejs_compat` and in Node scripts). R2/Queue *bindings* will come from the `cloudflare:workers` env object in Phase 1.

## First-run setup

1. `npm install`
2. Create a Neon project; put its URL in `DATABASE_URL` (in `.env` and `.dev.vars`). Set `SESSION_SECRET` and `SMARTEXCEL_SSO_SECRET` (any random 32+ byte value locally — doesn't need to match EventPilot's prod secret for local dev, since you won't have a real SSO redirect locally without also running EventPilot pointed at this instance).
3. `npm run db:push` (or `db:generate` + `db:migrate`)
4. `npm run db:seed` — seeds workspace, roles, permission defaults, and a Super Admin row for `SUPER_ADMIN_EMAIL` (no password — that row just gets updated in place the first time that person actually signs in via SSO).
5. `npm run dev` → there's no local login form; sign-in only happens via EventPilot's `/api/tools/smart-excel/launch` → `/sso` redirect. For local testing without a full EventPilot round-trip, hit `/sso?token=...` directly with a token you mint by hand using the same HMAC scheme (see `ssoLogin` in `src/server/auth.functions.ts`).

## Status

Phase 0 (foundation) done. SSO bridge to EventPilot done (2026-07-03) — replaces
the original standalone email/password + OTP auth entirely. Phases 1–3
(execution engine, recipes, breadth) are scaffolded but not implemented — see
`docs/PHASE-CHECKLIST.md`.
