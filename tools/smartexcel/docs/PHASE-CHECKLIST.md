# SmartExcel — running build checklist

Source of truth for what's done / pending. Update as scope lands (PRD §10 asks
for a persistent checklist so the original requirement is never lost).

## Phase 0 — foundation & architecture

- [x] Project scaffolding, tooling, repo standards (TanStack Start + Vite + CF Workers)
- [x] Core data model & job lifecycle states (`src/db/schema.ts`, `src/lib/job-states.ts`)
- [x] Roles & permissions framework (`src/lib/roles.ts`, `role_permissions`)
- [x] Super Admin protection for `md@tresconglobal.com`
- [x] Auth flows: email/password + OTP recovery via Resend (`src/server/auth.functions.ts`)
- [x] DB-backed sessions (httpOnly cookie), PBKDF2 hashing
- [x] Base UI shell with two-pane job workspace (`src/routes/_app.jobs.$jobId.tsx`)
- [x] Seed: workspace, roles, permissions, Super Admin (`src/db/seed.ts`)
- [x] Python worker stub + job contract (`worker/`)
- [x] R2 + Queues *bound* in `wrangler.jsonc` (still need provisioning: `wrangler r2 bucket create` / `wrangler queues create`)
- [x] Audit log writes wired into sensitive actions (`src/lib/audit.ts` — plan approve/reject, runs, delete/restore, visibility)
- [x] Background job queue dispatch + status updates (consumer in `src/worker.ts` → worker `/process` → `/api/worker-callback`)

## Phase 1 — conversational spreadsheet operations MVP

Code-complete and passing build/typecheck/lint. **Not yet verified against live
infra** — see "Pending" below. Items marked [x] are implemented in code.

- [x] New-job upload flow (file → R2) — presigned PUT (`requestUpload`/`confirmUpload`)
- [x] Clarification engine: one-by-one structured questions + "Other" (`clarify.functions.ts`)
- [x] Plan summary + approve/reject (`plan.functions.ts`, plan card in workspace)
- [x] Sample-run preview + approve/rework (`runs.functions.ts`)
- [x] Full run (async, completion notification) — coarse progress (0→100); incremental pings TODO
- [x] Virtualized result/preview grid (`@tanstack/react-virtual`, sticky header)
- [x] Gemini model-routing layer (fast / balanced / advanced tiers in `src/lib/ai.ts`)
- [x] Real processing in the Python worker — AI emits a structured `operations` spec
      (`src/lib/operations.ts`); worker runs them with pandas (trim, normalize headers,
      rename, drop columns, drop empty rows, dedupe, fill missing, sort, filter) and writes
      a real `.xlsx` + preview to R2. Verified end-to-end. (Formula insertion + doc→sheet
      extraction are Phase C.)
- [x] Workspace-wide visibility + restriction option (`setJobVisibility`)
- [x] Admin delete with soft delete + audit log (`deleteJob`/`restoreJob`, 30-day window)

### Live setup status (local dev — DONE)

- ✅ Cloudflare authed; R2 bucket `smartexcel-files` + CORS configured; Neon migrated + seeded.
- ✅ `.dev.vars` filled (DB/Gemini/Resend/R2); Python worker running (venv); dev server running.
- ✅ Run dispatch is a direct HTTP call to the worker (no paid Queues plan needed); the queue
  consumer remains dormant in `src/worker.ts` for future managed-retry use.

## Phase 2 — reusable recipes & operational maturity

Recipe lifecycle is code-complete (build/typecheck/lint green); same live-infra
caveat as Phase 1.

- [x] Promote successful jobs to recipe candidates (`createRecipeFromJob`, "Save as recipe")
- [x] Admin review & publish; layman titles/descriptions; version history (`recipes.functions.ts`, `_app.recipes.$recipeId.tsx`)
- [x] Apply approved recipe to a new file (`applyRecipe` → seeded job, clarification skipped)
- [x] Improved validation/anomaly reports — worker reports per-operation changes (rows in→out,
      duplicates/empty rows removed, missing values filled, columns renamed/dropped); surfaced
      in the run completion message
- [~] Large-file performance — sample stage processes a representative first-N-row chunk; full
      stage processes all rows. True streaming/chunked reads deferred as a future optimization.
- [ ] More robust workbook-preservation paths (multi-sheet, formulas, formatting) — deferred;
      genuinely complex and lower V1 value (CRM data is typically single-sheet). Worker currently
      operates on the primary sheet and emits a clean single-sheet output.

## Phase 3 — breadth, scale, advanced operations

- [x] Document extraction (worker `_load_df`): PDF (pdfplumber, table-or-text), DOCX
      (python-docx, first table or paragraphs), txt/md (delimiter sniff), xml (etree).
      All converge into the same DataFrame so the operations pipeline applies. DOCX verified.
- [ ] Multi-file jobs — **deferred**: PRD §3 lists "unrestricted multi-file orchestration in one
      job" as a V1 non-goal; would also require a data-model change (job → many inputs).
- [ ] Deeper Access support — deferred (best-effort/out of V1).
- [ ] Optional external-system connectors — deferred (PRD: not a core requirement).
- [~] Admin controls over model routing & retention — admin panel now shows the model tiers
      (fast/balanced/advanced) and the retention window read-only (`analytics.functions.ts`).
      Per-workspace editable overrides deferred (needs a settings table); PRD §6.10 allows this
      to stay hidden in early UI.
- [x] Analytics / usage reporting — admin dashboard: total/completed/failed jobs, success rate,
      jobs-by-status, recipe counts (`getWorkspaceAnalytics`).

## Deferred (per PRD)

Full in-browser spreadsheet editor; advanced VBA/macro preservation; social SSO;
ZIP ingestion; universal "any file / any workflow" claims.
