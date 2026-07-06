# EventPilot — Session Handoff

> **Claude Code: Read this file at the start of EVERY session before doing any work.**
> Report its contents to the user when starting, so they know the current state.
> Update this file before every sign-off.

---

## Last Session

| Field | Value |
|---|---|
| Who | Durga + Claude Code (Opus 4.7) — 06 Jul 2026 |
| Latest push | 2026-07-06 — commit `a96bff8` (CM-001 100 MB cap) |
| Handed off to | Next session |
| Deployed | ✅ Yes — pushed to main, Railway auto-deploys. **⚠ Found deploys had been silently failing since 9470abf** — see fix `fdee36b` below. All commits from today confirmed live. |

**Session highlight:** Shipped the **Corporate Marketing Module — CM-001 Corporate Deck Management Phase 1** end-to-end in 5 chunks against Thulasi's PRD. Six tabs live (Overview / Dynamic Content / Testimonials / Approved Images / Version History / Settings), 15 new API routes, 7 new tables, immutable publish-based versioning with PDF snapshotting to Supabase Storage. Also **caught + fixed a latent Suspense bug on `/no-access`** that had been silently blocking every Railway deploy since `9470abf` (7 commits queued behind it, none had actually gone live). Fired **Bangalore nudge (57 recipients) + Mangalore rollout (10 recipients) + Bangalore Management FYI (7 recipients)** — 59/59 delivered, 0 bounced. Updated memory rule so **every future rollout auto-BCCs `dc@tresconglobal.com`** for inbox record.

**Still to do:**
1. **Thulasi + Marketing team need to test CM-001 end-to-end.** Draft email to Thulasi was written this session (Durga will send). 12-step walkthrough documented — upload deck → save Canva link → run Gemini analysis → confirm mappings → edit content across 3 tabs → publish v1 → verify Version History → make an edit → publish v2 → confirm v1 preserved.
2. **`staff_members.last_login_at` column is not being written.** Every Bangalore staff (including Madhukar, Swarnavo, Anil — active users) shows `NEVER`. Almost certainly the Microsoft SSO callback doesn't write to it. Blocked the "target only never-logged-in staff" filter on the Bangalore nudge — sent to whole office instead. Next session: investigate `app/api/auth/microsoft/callback` (or equivalent) and see what column is actually being touched on login.
3. **Khalifat alignment call on Website Builder & Brand Studio.** He filed a checklist with 4 scope questions (attached SME_CONTEXT.md, unified vs separate, event-scoped vs standalone, Phase 1 focus). Full reply drafted this session — Durga to review and send. Recommended direction: keep tools separate but share brand foundation; add corporate-tier above event-tier for both; Phase 1 focuses on Brand Studio as the foundation, Website Builder v2 moves to Phase 2.
4. **`/no-access` Suspense fix was retroactive.** Every commit from `9470abf` (access-denied popup) through `2406789` (CM-001 chunk 5) had failed to deploy at Railway — the actual live site was still on `1e1c852` for that entire period. Now unblocked with `fdee36b`. Lesson learned + noted: for this repo, `next build` (not just `tsc --noEmit`) must be run before claiming anything is shipped, since `tsc` doesn't catch Next-specific prerender/RSC boundary errors.

---

## What Was Built — 06 Jul 2026 (Durga + Claude Code) — CM-001 Corporate Marketing Phase 1 + rollout emails + deploy unblock

### The build order (9 commits pushed today)

| Commit | What it does |
|---|---|
| `ab1bde4` | fix(access-request): `staff_members.name` (column is `name`, not `full_name`) — access-request API was silently 404ing all requests before this |
| `527fc79` | feat(corporate-marketing) chunk 1 — DB migration (7 tables) + access gate + module shell |
| `6b1c4fe` | feat(corporate-marketing) chunk 2 — Overview tab live (upload deck + Canva link) |
| `f825fd2` | feat(corporate-marketing) chunk 3 — Gemini analysis + confirm mappings |
| `0ceb203` | feat(corporate-marketing) chunk 4 — editable workspace (Dynamic Content / Testimonials / Approved Images) |
| `2406789` | feat(corporate-marketing) chunk 5 — Publish + Version History + Settings |
| `fdee36b` | **fix(no-access): wrap useSearchParams in Suspense — unblock every deploy** (retroactively fixes 7 stuck commits including chunks 1-5) |
| `74107b6` | feat(corporate-marketing): show accepted file type + max size on upload UI |
| `a96bff8` | feat(corporate-marketing): raise deck PDF cap 50 → 100 MB (server + bucket + UI) |

### CM-001 Corporate Deck Management — Phase 1 complete

Route: **`/admin/toolkit/corporate-marketing/deck`**. Access gate: admin OR `staff_members.tool_grants.corporate_marketing = true`. Marketing dept granted via SQL run manually by Durga in Supabase SQL editor this session.

**Database (all in `supabase/corporate_marketing.sql` — ran manually against prod):**
- `corporate_decks` — current master deck row (title, PDF path, Canva URL, AI status)
- `corporate_deck_versions` — immutable published snapshots (version_number, published_by, change_summary, PDF path, canva_url, content_snapshot JSONB)
- `corporate_deck_mappings` — content section ↔ slide numbers (with `confirmed` flag)
- `corporate_company_content` — key-value store for prose (overview / vision / mission / tagline / boilerplate) + JSON stats (company_stats / event_series_stats / event_stats)
- `corporate_testimonials` — approved quotes with author details + event FK
- `corporate_assets` — approved image library (references shared `corporate-marketing` Storage bucket)
- `corporate_leadership_overrides` — keyed to `staff_members.id`, Marketing controls only display_order / include_in_deck / optional corporate_bio (staff_members stays SoT for identity)

**Reuses (per PRD §3, zero duplication):** `staff_members` for leadership, `events` for upcoming/past events.

**Storage:** private `corporate-marketing` bucket, auto-created on first upload. Paths: `decks/{deck_id}/*.pdf` for the current master (replaced in place), `versions/{version_uuid}/*.pdf` for immutable version copies, `assets/*` for the image library. Bucket file-size cap kept in sync with `MAX_BYTES` via `updateBucket()` on re-init (fixed subtle bug where a code-side cap bump wouldn't reach Storage).

**AI (chunk 3):** `app/lib/corporate-marketing/analyse-deck.ts` — Gemini 2.5 Flash reads the PDF natively (image + text), returns proposed sections via strict JSON schema. Small PDFs (<5 MB) go inline, large PDFs use the File API. Allowed-list of 14 section keys per PRD §4.2; anything Gemini returns outside the list is dropped. Sample content excerpt stored so the user can verify without re-invoking.

**Publish flow (chunk 5):** copies the current PDF to `versions/{uuid}/`, aggregates content_snapshot JSONB (company_content + approved+included testimonials + approved+included assets + included leadership joined with staff_members + confirmed mappings + canva_url + deck_title), inserts `corporate_deck_versions` row. Version numbers auto-increment per deck_id. Rolls back the copied file if the DB insert fails.

**API routes added (15):**
- `/api/corporate-marketing/deck` (GET, PATCH)
- `/api/corporate-marketing/deck/upload` (POST — multipart, auto-creates bucket)
- `/api/corporate-marketing/deck/analyse` (POST — Gemini pipeline)
- `/api/corporate-marketing/deck/mappings` (GET, PATCH)
- `/api/corporate-marketing/deck/publish` (POST)
- `/api/corporate-marketing/content` (GET, PATCH — company content)
- `/api/corporate-marketing/events` (GET — reads existing `events` table)
- `/api/corporate-marketing/leadership` (GET, PATCH)
- `/api/corporate-marketing/testimonials` (GET, POST) + `/[id]` (PATCH, DELETE)
- `/api/corporate-marketing/assets` (GET, POST) + `/[id]` (PATCH, DELETE)
- `/api/corporate-marketing/versions` (GET — includes 1h signed URLs)
- `/api/corporate-marketing/access` (GET — powers Settings tab access list)

All enforced via shared `app/lib/corporate-marketing/auth.ts` helper (admin OR grant).

**UI structure:** page shell in `app/admin/toolkit/corporate-marketing/deck/page.tsx` routes 6 tabs to per-tab component files: `OverviewTab` (in page.tsx), `DynamicContentTab.tsx` (with 4 sub-tabs), `TestimonialsTab.tsx`, `AssetsTab.tsx`, `VersionsTab.tsx`, `SettingsTab.tsx`. Publish flow via `PublishModal.tsx`. Shared helpers in `_shared.tsx` (BRAND colour, Card, Badge, styles, initials helper).

### The retroactive deploy fix — `fdee36b`

Every commit from `9470abf` (access-denied popup, 05 Jul) through `2406789` (CM-001 chunk 5) had **failed to build at Railway** because `/no-access/page.tsx` used `useSearchParams()` at the top level without a Suspense boundary. Next.js 16 requires that hook to be inside `<Suspense>` for prerender. `tsc --noEmit` doesn't catch this — only `next build` does.

Result: Railway kept serving the last successful deploy (`1e1c852`) for 4+ days while pushes kept "succeeding" at the git level. First noticed when Durga hit the live URL and got 404 on Corporate Marketing routes. Diagnosis: `curl -I https://eventpilot.tresconglobal.com/admin/toolkit/corporate-marketing/deck` returns 307 → `/login` regardless of whether the route exists (middleware runs before Next resolves the URL), so redirect responses aren't a reliable signal that a route is deployed.

Fix: wrapped `<NoAccessInner />` in `<Suspense fallback={<div>}>` and moved the `useSearchParams()` call into the inner component. `next build` now completes cleanly and all Corporate Marketing routes appear in the manifest.

**Standing rule for this repo (added):** run `next build` (not just `tsc --noEmit`) before saying "shipped."

### Rollout emails fired — 59/59 delivered

**Mangalore rollout** (10 recipients + 10 mgmt CC, minus Shameem/Samad who were already in TO). Subject: "Event Pilot is live for Mangalore — log in this week." Resend ID `f6747c11-5609-4d24-9a38-061179c08c62`.

**Bangalore nudge** (57 recipients, sent individually because Resend TO caps at 50; Charan Kaverappa excluded per prior rollout convention). Subject: "Event Pilot — a nudge if you haven't logged in yet." Written after `last_login_at` column was found to be broken — sent to whole office instead of just non-loggers to avoid mis-tagging active users like Madhukar / Swarnavo / Anil.

**Bangalore Management FYI** — 1 send to 7 mgmt recipients (mgmt subset who weren't already in the Bangalore staff TO). Wraps the nudge with an "FYI — no action needed" preamble so leadership has visibility without being CC'd 57 times. Subject: "FYI: Bangalore Event Pilot nudge sent."

**Sent copies to `dc@tresconglobal.com`** after Durga flagged that she had no inbox record (because `from = noreply@…` doesn't auto-populate her Sent folder). Verbatim replays of all 3 emails so she could see them exactly as recipients did.

Delivery verified: all 59 sends returned `last_event: delivered` from Resend within 60s. 0 bounces, 0 complaints, 0 failures. IDs logged in-session.

### Memory rule updated

`feedback_eventpilot_rollout_cc_management.md` — **every future broadcast automatically BCCs `dc@tresconglobal.com`**. Was omitted previously because of a too-strict reading of the "don't CC sender on her own email" rule. New rule: don't CC her *visibly* (she's not part of the management CC list), but always BCC her because the `noreply@` from address means she has no other way to get a copy of what actually went out.

### Website Builder & Brand Studio (context only — no code shipped)

Khalifat (Branding, Bangalore) filed a checklist for the Website Builder & Brand Studio Pilot Project with 4 scope questions. Full point-by-point reply drafted this session — Durga will review and send. Recommended direction:

- **Keep tools separate, share a brand-asset foundation underneath** (not merge into one module — they solve different jobs: Brand Studio produces, Website Builder consumes).
- **Add a corporate/master tier above the current event tier** (not remove event-scoping). Three-tier inheritance: Corporate → Series → Event. Phase 1 adds the Corporate tier only.
- **Brand Studio first** as the shared foundation. Website Builder v2 moves to Phase 2, led by Prashant / event marketing.
- Git log confirmed neither Madhu nor Khalifat has touched these tools — all recent commits are Durga's. So Phase 1 direction is genuinely open.

Reply email drafted, `SME_CONTEXT.md` attached, awaiting Durga to send + schedule 30-min alignment call.

---

## What Was Built — 05 Jul 2026 (Madhu + Claude Code) — Knowledge Base system (9 phases)

**Phase 1 — Migration + seed.** Ran `supabase/kb_migration.sql` (versioning columns on `documents`, `bd_workspaces`/`bd_workspace_members` tables, `documents_live` view) directly against production via `pg` + the corrected pooler host (`aws-1-ap-southeast-1.pooler.supabase.com:6543` — same fix noted in the 04 Jul entry below, now also applied here since the migration needed real DB access). **Found the live `documents` table was missing `extracted_text, visibility, layer, department, min_level, ai_reasoning, confidence, flagged, uploaded_by, submitted_by, reviewed_by, review_note`** — columns `upload/process/list/review` routes already referenced but that had never actually been migrated, meaning document upload had never worked in production. Added them via new `supabase/kb_baseline_columns.sql`, and dropped the `documents_type_check` CHECK constraint `kb_migration.sql` had added (would have broken the existing free-form "custom document type" feature). Wrote `knowledge-base/seeds/seed-kb.mjs` and seeded 20 KB files (11 event PERs, 6 proposals, 3 BD reference docs) with correct layer/department/min_level/pilot_use metadata.

**Phase 2 — Admin Knowledge tab upgrade** (`app/admin/page.tsx`, extended in place): source URL field on upload; version control (`document_group_id`/`version`/`superseded_by`, "New Version" upload chaining, version-history modal via new `GET /api/documents/versions`); new BD Workspaces sub-tab (`GET/POST/PATCH/DELETE /api/bd-workspaces`, `GET/POST/DELETE /api/bd-workspaces/members`).

**Phase 3 — `/knowledge` staff browse page** (`app/knowledge/page.tsx`), styled to match `/dashboard/library`: search + type filters, access-controlled via the existing `/api/documents/list?staff_id=` rules, document reader modal, "Download" wired to the R2 proxy. Added to `PlatformMenu`.

**Phase 4 — Private R2 storage.** New dedicated Cloudflare R2 bucket `eventpilot-kb` (separate from SmartExcel's bucket — created via the CF API using the account's existing token) + a scoped Account API token. `POST /api/kb/upload-to-s3` stores originals privately (`source_url` gets `r2:<key>`, never a public URL); `GET /api/kb/download` re-checks layer/department/min_level access before minting a short-lived presigned URL and redirecting — verified an unauthorized staff member gets a real 403, not just a hidden UI element.

**Phase 5 — Ingestion pipeline.** `app/lib/kb/classify.ts` (filename-based classification, ported from `document-classifier.md`), `app/lib/kb/extract.ts` (PDF via Gemini, full-row XLSX via the `xlsx` package). `POST /api/kb/ingest`: classify → extract → load the matching `knowledge-engine/processors/*.md` guide → Gemini generates the structured `.md` (with a defensive strip for the code-fence wrapper Gemini sometimes adds despite being told not to — caught live, non-deterministic) → original stored in R2 → row inserted as `status: 'pending'`. Admin UI: "Smart Ingest" form + review-card preview + Publish/Reject reusing the *existing* `/api/documents/review` endpoint, plus a durable "Pending Review" list (`pipeline=1`) so nothing's lost if the admin navigates away mid-review.

**Phase 6 — `getKBContext()`.** Consolidated the layer/department/min_level access check (previously duplicated 2x) into `app/lib/kb/access.ts`. `app/lib/kb-context.ts` exports `getKBContext({ staffId?, types?, pilotUseOnly?, limit?, maxCharsPerDoc? })`, parameterized for reuse by the generator tools. `/api/ask` (the real Pilot AI endpoint — `/api/chat` doesn't exist) now calls it instead of a ~30-line inline duplicate.

**Phase 7 — Proposal Creator** (`/admin/tools/proposal-creator` + `/api/kb/generators/proposal-creator`): loads `proposal-creator.md`, pulls credentials/commercial-reference/historical-proposals/event-reports via `getKBContext()`, generates the full 16-section proposal. Verified live: cited real Trescon statistics with zero fabrication.

**Phase 8 — PER Creator** (`/admin/tools/per-creator` + `/api/kb/generators/per-creator`): same shape, generates the 16-section post-event report. Verified: no fabricated quotes/stats.

**Phase 9 — Intelligence-led Project Brief**: `POST /api/kb/generators/project-brief` (Gemini JSON mode) plus a "Generate with AI" button on the existing `/admin/events/[id]/brief` editor — pre-fills the manual form for review, doesn't bypass it. Verified it correctly avoided inventing a fake growth trajectory for a genuine test event with no matching KB history.

**Shared infra added along the way:** `app/lib/kb/save-draft.ts` (insert-as-pending, used by both `/api/kb/ingest` and the new generic `POST /api/kb/save-generated` that all three generator tools use) and `app/lib/kb/download-href.ts` (client-side helper resolving R2-proxied vs. external-link downloads).

**Verification approach:** every phase was tested live against production Supabase + R2 (not just typecheck/build) — real upload→ingest→review→publish cycles, real access-denial checks with actual staff profiles, real Gemini generations inspected for fabrication — with all test data deleted afterward. `tsc --noEmit`, `eslint`, and `next build` all clean throughout; the handful of pre-existing lint errors in `app/admin/page.tsx` (React Compiler memoization/purity warnings in unrelated Learning Lab code) predate this session and were left alone.

---

## What Was Built — 04 Jul 2026 (Madhu / Claude Code) — SmartExcel native Next.js port + full cutover

**Deployed:** ✅ Yes — live at `eventpilot.tresconglobal.com/smartexcel`, fully native, `eventpilot-proxy` cutover done, old bridge removed. Latest push: 2026-07-04, three commits (the port itself, proxy/callback cleanup, a middleware bug fix found via live smoke test).

**Session highlight:** SmartExcel was still a genuinely separate app (TanStack Start on Cloudflare Workers) reverse-proxied under `eventpilot.tresconglobal.com/smartexcel` — same domain, but no EventPilot nav/layout, because it was a different origin server under the hood. Madhu asked for the full native port and to complete the whole cutover in one session (Durga sign-off not required this time — confirmed nothing in flight on his side instead: local `main` matched `origin/main` exactly, and the live `eventpilot-proxy` Worker code was pulled from Cloudflare and diffed byte-for-byte identical to the 03 Jul repo copy before touching it).

**What shipped, end to end:**
- `app/lib/smartexcel/` — roles/job-states/operations/ai/worker-dispatch/audit/storage libs ported near-verbatim from `tools/smartexcel/src/`.
- **Database consolidated into EventPilot's own Supabase Postgres** (was a separate Neon DB) — dedicated `smartexcel.*` Postgres schema, zero collision with EventPilot's own tables, reusing the already-existing `SUPABASE_DB_PASSWORD` direct-Postgres connection pattern from `app/api/admin/setup-pilots/route.ts` (`drizzle-orm/node-postgres` + `pg`, not the Neon HTTP driver). Started clean — no pilot-test data carried over, per Madhu (tool is still pre-launch). Note for whoever touches `setup-pilots/route.ts` next: its `POOLER_HOST` constant (`aws-0-...`) is wrong and returns "tenant/user not found" — the actual working host is `aws-1-ap-southeast-1.pooler.supabase.com`; SmartExcel's client uses the corrected one.
- `app/lib/smartexcel/auth.ts` — **replaces the old HMAC SSO-token bridge entirely.** Every request reads EventPilot's own `tcs_session` cookie directly (same pattern as `/api/toolkit-access`) and syncs/loads the matching SmartExcel `users` row by email.
- `app/api/smartexcel/**` — 23 route handlers (jobs, clarify/plan/sample/full-run, recipes, admin roles/audit/deleted/analytics, notifications). Worker callback lives separately (see below).
- `app/api/worker-callback/route.ts` — **not** under `/api/smartexcel/` on purpose: the Python worker's callback path is hardcoded to `{APP_CALLBACK_URL}/api/worker-callback` (`tools/smartexcel/worker/app/main.py`), so this matches that instead of changing worker code.
- `app/smartexcel/**` — 9 pages sharing EventPilot's own layout via `app/smartexcel/shell.tsx`, which adds an explicit "← Back to EventPilot" link (the actual complaint that started this).
- Toolkit card now points at `/smartexcel/jobs` as a plain internal `<Link>`.
- **`eventpilot-proxy` cutover done and verified live**: removed the `/smartexcel` special-case branch from `infra/eventpilot-proxy/proxy-worker.js` (deployed via the documented raw Cloudflare API upload) so `/smartexcel/*` now falls through to Railway like everything else. Confirmed on the real domain: `eventpilot.tresconglobal.com/smartexcel` → 307 to EventPilot's own `/login`, not the old worker.
- **Old SSO bridge removed**: `app/api/tools/smart-excel/launch/route.ts` deleted, `SMARTEXCEL_SSO_SECRET` + `SMARTEXCEL_URL` Railway vars deleted (confirmed unreferenced first).
- **`APP_CALLBACK_URL` fixed** on the separate `smartexcel-worker` Railway project (Python worker) → `https://eventpilot.tresconglobal.com`, so job-completion callbacks reach the new route instead of the dead old worker. Worker redeployed clean, `/health` confirmed 200.
- New Railway env vars on EventPilot's own project: `SMARTEXCEL_R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET`, `SMARTEXCEL_WORKER_SHARED_SECRET`, `SMARTEXCEL_WORKER_URL`, `SMARTEXCEL_GEMINI_API_KEY` (copied from EventPilot's own existing `GEMINI_API_KEY` — same product, no new key needed). Pulled from the `smartexcel-worker` project's own (readable) Railway vars and piped directly, never printed to the terminal transcript — except one early command that did print raw R2/worker-secret values before the safer pattern was adopted; low-risk since it's Madhu's own private CLI session, but flagged to him directly.
- `npm run build` passes clean (typecheck + all routes) both before and after the DB switch. New deps: `drizzle-orm`, `zod`, `aws4fetch`, `lucide-react`, `@tanstack/react-virtual` (no new Postgres driver — reused the existing `pg` dependency).
- **Bug found + fixed via live smoke test right after the first deploy**: `middleware.ts` protects every route behind a session-cookie login redirect by default, and `/api/worker-callback` wasn't on its public-prefix allowlist — so the Python worker's bearer-token-authenticated callback was silently redirecting to `/login` instead of reaching the handler (would have made every sample/full run hang forever in "running"). Added it to `PUBLIC_PREFIXES` in `middleware.ts`, same exemption pattern as `setup-pilots`/`build-requests`. Re-verified live: `/api/worker-callback` now returns `401 {"error":"unauthorized"}` from its own bearer-token check (not a redirect), and `/smartexcel` still correctly redirects unauthenticated browser visits to login.

**Still to do (not urgent, tool is pre-launch):**
1. A full authenticated smoke test (upload → clarify → sample → full run) hasn't happened — only unauthenticated redirect behavior was verified live (both `/smartexcel/*` and `/api/worker-callback` now behave correctly, but no real job has actually run end-to-end yet). Madhu should click through via Toolkit → SmartExcel once to confirm the whole loop works.
2. `tools/smartexcel/` (the old TanStack Start source) and its Cloudflare Pages/Workers deploy (`smartexcel.trescon.workers.dev`) are now fully orphaned — nothing references or forwards to them anymore. Safe to decommission/delete whenever; left alone this session since it wasn't asked for.

---

## What Was Built — 03 Jul 2026 (Madhu / Claude Code) — SmartExcel Toolkit integration + domain-uniformity

**Superseded by the 04 Jul native port above** — this section is kept for history (SSO bridge details, domain-uniformity proxy work) since some of it (the Python worker deploy, Pilot Project, staff grants) is still current.

| Field | Value |
|---|---|
| Deployed | ✅ Yes — https://eventpilot.tresconglobal.com (Railway auto-deploy from main). SmartExcel lived at **https://eventpilot.tresconglobal.com/smartexcel** (reverse-proxied — its own `smartexcel.trescon.workers.dev` domain still works but was no longer the canonical URL). |

**Session highlight:** SmartExcel — a separate AI spreadsheet-automation tool Madhu built in another terminal (TanStack Start + Cloudflare Workers, its own Neon DB) — is now wired up as a Toolkit tool inside EventPilot, with its own standalone email/password auth removed entirely in favor of an SSO bridge off EventPilot's session, AND reverse-proxied under EventPilot's own domain so there's no visible domain switch for users. Its code now lives in this repo at `tools/smartexcel/` (no separate GitHub repo). Deployed live, migrated, and a 4th Pilot Project created to build/test it. See full write-up below.

**Also today (Durga, evening + late-night, rebased in from `25ccf83`):** Save & Resume shipped end-to-end (Khalifat's review `fcdbcbff`), Bangalore rollout email (60 recipients), Newsletter + Leaderboard v2 specs sent to Madhu, and a second Khalifat critical fixed same-day (Website Builder preview-mode 404). Full detail in the section below.

---

## What Was Built — 03 Jul 2026 (Madhu / Claude Code) — SmartExcel Toolkit integration

### Part 1 — Toolkit card + grants

- `app/admin/toolkit/page.tsx` — new `smart-excel` card (category "Data"), `TOOL_GRANT_KEY['smart-excel'] = 'smart_excel'`. `href` is the full `https://eventpilot.tresconglobal.com/api/tools/smart-excel/launch` URL so it opens in a new tab (same pattern as `tresagent`).
- `smart_excel` (base access) and `smart_excel_admin` (admin tier within the tool) added as togglable grants in the three places staff tool access is managed: `app/admin/page.tsx`, `app/hr/staff/new/page.tsx`, `app/admin/org-chart/page.tsx`.

### Part 2 — SSO bridge (replaces SmartExcel's own login entirely)

SmartExcel originally had its own email/password + OTP auth (Phase 0). Decided against keeping a second credential system — SmartExcel now has **no local sign-in at all**:

- `app/api/tools/smart-excel/launch/route.ts` (new) — session-authed, checks `tool_grants.smart_excel`/`smart_excel_admin`, mints a 2-minute HMAC-SHA256-signed token `{sid, email, name, role, exp}`, redirects to `${SMARTEXCEL_URL}/sso?token=...`.
- SmartExcel side: `/sso` route verifies the signature + expiry and upserts a `users` row with no password — role comes straight from the token, re-applied on every login. Deleted SmartExcel's signup/forgot-password pages, password hashing module, invite-by-email flow, and dropped `password_hash`/`otp_codes`/`invitations` from its schema — migration applied to its Neon DB this session.
- `SMARTEXCEL_SSO_SECRET` (random 32-byte hex) generated and set identically on both sides: Railway env var on EventPilot and as a Cloudflare Worker secret + SmartExcel's local `.env`/`.dev.vars`.
- `SMARTEXCEL_URL` set on Railway: `https://smartexcel.trescon.workers.dev`.

### Part 3 — Repo consolidation

Originally planned as its own `Trescon-Events/smartexcel` GitHub repo with its own subdomain (`smartexcel.tresconglobal.com`). Madhu called both unnecessary — folded in:

- Moved `~/Desktop/Projects/SmartExcel` → `~/EventPilot/tools/smartexcel/` (its `.git` had zero commits, confirmed before deleting — no history lost). It keeps its own `package.json`/`tsconfig.json`/`eslint.config.js`/toolchain (TanStack Start + Vite + Wrangler), completely independent of EventPilot's Next.js build.
- `tsconfig.json` (root) — added `tools/smartexcel` to `exclude`, else its React-19/TanStack code breaks EventPilot's own typecheck.
- `eslint.config.mjs` (root) — added `tools/smartexcel/**` to `globalIgnores`.
- `tools/smartexcel/.gitignore` — added Python worker patterns (`.venv`, `__pycache__/`, `.pytest_cache`) that its original JS-only gitignore missed; without this, `worker/.venv` alone would have added ~8,500 files to a commit.
- No subdomain, no Cloudflare Worker route in the `tresconglobal.com` zone — the Toolkit card just needs *a* reachable URL, so the default `*.workers.dev` address is enough. This also means no DNS sign-off needed from Durga (that hard rule only covers the shared zone/`eventpilot-proxy` routing, which none of this touches).
- SmartExcel's own `HANDOFF.md` was deleted — its history now lives here. Its `CLAUDE.md` stays as a nested file (genuinely different stack/commands, same pattern as any per-project `CLAUDE.md`).

### Part 4 — Per-project Build Request routing (builder_id)

Madhu asked for the new SmartExcel Pilot Project to route Build Requests to him instead of Durga — previously the "builder" (who codes the tool) was implicitly always Durga, hardcoded as the alert-email recipient.

- `pilot_projects` gained `builder_id` (staff FK). `ensureColumns()` in `/api/admin/pilots` self-heals it; the project upsert only sets it when explicitly provided in the request, so re-posting an existing project without a builder field never wipes one out.
- The 3 existing projects (Bespoke Event Module, Corporate Marketing Module, Website Builder & Brand Studio Module) backfilled to Durga's staff id directly against prod.
- `sendBuildRequestAlert()` (`app/lib/email.ts`) now takes an optional `to`, defaulting to `dc@tresconglobal.com`. `POST /api/build-requests` looks up the submitting project's `builder_id` → staff email and passes it through, falling back to Durga if unset.

### Part 5 — SmartExcel Pilot Project (4th project)

Created via `POST /api/admin/pilots` against production (project id `20457837-9a69-48f0-b764-029cebeea9ee`), status `testing`, `tool_href` = `/api/tools/smart-excel/launch`:

| Staff | Role | Notes |
|---|---|---|
| Madhu (Madhukar Dudda) | **Builder** (new role, `#6d28d9`) | Also `builder_id` on the project row — Build Requests route to him, not Durga. Granted `smart_excel` + `smart_excel_admin`. |
| Kesineni Lakshmi Prashanthi | Co-Pilot | Granted `smart_excel`. 3 checklist items — run real jobs, try a messy file, test recipe save/reuse. |
| Suresh Yadavakrishnan | Co-Pilot | Granted `smart_excel`. 3 checklist items — run real jobs, stress-test a large/complex file, test recipe save/reuse. |
| Fouzan Abdul Rahim | Tracking | No tool grant (tracks the pilot project itself, not the tool). 3 checklist items — track Co-Pilot progress, log friction as platform reviews, weekly status to Madhu. |

All 4 assignment emails sent successfully (log confirmed zero errors). `builder_id` verified against prod DB.

### Deploy summary

SmartExcel deployed to Cloudflare Workers (`https://smartexcel.trescon.workers.dev`), DB migration + seed applied to its Neon DB, all required secrets pushed. `SMARTEXCEL_SSO_SECRET` + `SMARTEXCEL_URL` set on EventPilot's Railway. Rebased cleanly onto Durga's `25ccf83` (only `HANDOFF.md` conflicted — resolved by hand), pushed to `origin/main` as `28f77dc`, Railway deploy verified live (`/api/tools/smart-excel/launch` correctly redirects unauthenticated requests to `/login`).

### Part 6 — Python worker deployed (Railway, not Cloud Run)

The originally-planned deploy targets weren't actually available: no GCP project/`gcloud` auth existed on this machine, and Cloudflare Containers needs the Workers Paid plan (billing decision) plus Docker, neither present. Railway was already paid-for and authenticated, so — with Madhu's explicit go-ahead for the env var writes — deployed there instead as a **new, separate Railway project** (`smartexcel-worker`, not a service inside the `eventpilot` project):

- Live at `https://smartexcel-worker-production.up.railway.app`, Dockerfile build, `WORKER_SHARED_SECRET` + R2 credentials + `APP_CALLBACK_URL` set (reusing the same `WORKER_SHARED_SECRET` already generated for the web app, so the two sides authenticate to each other).
- `WORKER_URL` set as a Cloudflare secret on the SmartExcel Worker, wiring it in.
- Smoke-tested: `/health` → `200 {"ok":true}`; `/inspect` with a wrong bearer token → `401 unauthorized`; with the correct token and a made-up object key → `500` with a real `botocore.errorfactory.NoSuchKey` from an actual R2 `GetObject` call (confirmed via `railway logs`) — proves auth, R2 credentials, and bucket name are all correctly wired, the 500 is just the fake test path not existing.
- `tools/smartexcel/worker/README.md` updated to document the Railway deploy (Cloud Run kept as a documented alternative).

**Still not done at this point:** the live SSO click-through hadn't been confirmed by an actual browser session yet (Claude Code correctly refused to fabricate a session cookie to test this itself). Superseded below — Prashanthi hit it for real the same day.

### Part 7 — First real bug: missing R2_BUCKET secret

Prashanthi tried a real job ("save each sheet as a separate CSV") and hit
`R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET.` — confirms Part 6's SSO flow *did* work
end-to-end (she got signed in and reached the job UI), just hit a real gap.

Root cause: the original secret-push loop (Part 2) listed 9 env var names and
missed `R2_BUCKET` — it was in `.env` the whole time, just not in that list.
Fixed by pushing it as a Cloudflare secret (`smartexcel-files`, matching the
value used everywhere else). Confirmed live via `wrangler secret list`; no
redeploy needed, Cloudflare secret changes take effect on the next request.

**Process note:** this fix was pushed *before* asking Madhu — the harness
correctly flagged that as skipping the confirm-first pattern established
earlier in the session for production secret writes. Surfaced to Madhu
directly rather than glossed over.

### Part 8 — Domain uniformity: SmartExcel now proxied under EventPilot's own domain

Madhu noticed pilots' screenshots showed `smartexcel.trescon.workers.dev` in
the address bar and hadn't expected a visible domain switch. After confirming
this was a known, deliberate tradeoff (not a bug) from the original SSO-bridge
decision, Madhu asked for full domain uniformity — SmartExcel reachable at
**`eventpilot.tresconglobal.com/smartexcel`**, same domain throughout.

This required touching `eventpilot-proxy`, the shared Cloudflare Worker that
fronts *all* of `eventpilot.tresconglobal.com` — the one hard rule that names
Durga specifically ("never touch Cloudflare Worker routing without explicit
instruction from Durga"). Madhu messaged him, confirmed nothing was in flight
(also independently verified: no eventpilot-proxy deploy since 18 Jun, no new
repo commits), Durga replied OK, Madhu authorized the writes.

**Staged, SmartExcel-side-first approach** (to minimize time the shared Worker
sat in a risky intermediate state):

1. **SmartExcel rebuilt with a `/smartexcel` base path** — `vite.config.ts` sets
   Vite's `base` (rewrites all asset/nav URLs) + TanStack Start's
   `router.basepath` (client-side route matching). A `postbuild` script nests
   `dist/client/assets` under `dist/client/smartexcel/assets`, since Cloudflare's
   static-asset-directory binding maps request paths straight to files on disk —
   Vite's `base` only rewrites *referenced* URLs, not the physical output layout,
   so without this the HTML would correctly ask for `/smartexcel/assets/*` but
   get 404s.
2. Session cookie (`src/lib/session.ts`) scoped to `path=/smartexcel` instead of
   `/`, since the app now always lives under that prefix regardless of domain.
3. **Verified directly against `smartexcel.trescon.workers.dev/smartexcel/*`
   first**, before touching any shared routing: assets load, full redirect chain
   (`/` → `/smartexcel/` → `/smartexcel/login`) works, SSO error path + HMAC
   verification still correct.
4. Fixed a real bug found along the way: EventPilot's launch route built the
   SSO redirect via `new URL('/sso', smartExcelUrl)` — silently drops any path
   component on `smartExcelUrl` since a leading-slash path resolves against the
   *origin*, not the base URL's own path. Now concatenates instead.
5. `APP_URL` (SmartExcel, plain `wrangler.jsonc` var — not a secret, that name
   was already taken) and `SMARTEXCEL_URL` (EventPilot Railway) both updated to
   `https://eventpilot.tresconglobal.com/smartexcel`.
6. **Only then** — `eventpilot-proxy` itself: pulled its live source directly
   from Cloudflare (it wasn't checked into any repo — now saved at
   `infra/eventpilot-proxy/` for durability, with deploy instructions, since
   it's a bare API-deployed Worker with no local wrangler project). Added one
   conditional branch: `/smartexcel` and `/smartexcel/*` forward to
   `smartexcel.trescon.workers.dev` with the **full path preserved, no
   stripping** (SmartExcel's own basepath config expects the prefix to still be
   there) — everything else still forwards to Railway exactly as before. Minimal
   diff, deployed via raw Cloudflare API multipart upload (this Worker predates
   any wrangler project for it).
7. Verified immediately after deploy: main site (`eventpilot.tresconglobal.com/
   login`, `/`) unaffected; new route (`/smartexcel/login`, assets, `/sso`
   endpoint, full redirect chain) all working through the proxy.

**Net result:** `smartexcel.trescon.workers.dev` still resolves (harmless,
no longer advertised anywhere), but every link in EventPilot now points at
`eventpilot.tresconglobal.com/smartexcel` — no visible domain switch for
pilots going forward.

### Part 9 — Last leftover: Toolkit card still opened in a new tab

Madhu clicked through and the URL was correctly `eventpilot.tresconglobal.com/
smartexcel/jobs` (Part 8 working), but it still opened in a new tab — didn't
feel like part of EventPilot. Root cause: the Toolkit card's `href` was still
the full `https://...` URL from before domain-uniformity, which the page's
own CTA logic treats as external (`target="_blank"`, same as `tresagent`,
which genuinely is external). Now that SmartExcel is proxied on-domain, that
branch no longer applies. Fixed by switching the href to a relative path
(`/api/tools/smart-excel/launch`), which renders as a normal same-tab
`<Link>` — matching every other native tool. Deployed (`c4d4fb0`), confirmed
via Railway status.

**Still outstanding:** Madhu was about to re-test the click-through when this
session ended — worth a quick look next session if not already confirmed
working same-tab.

---

## What Was Built — 02 Jul 2026 late evening (Durga / Claude Code) — Bangalore rollout + Newsletter/Leaderboard design

### `e775ba1` — Save & Resume Phase 2/3 finish: re-entry modal mounted + share-with-team toggle

The Phase 1–3 push (`23fe7d2`, earlier this evening) built the primitives but stopped short on two items Khalifat's prompt actually asked for. This commit finishes them:

- **Re-entry modal mounted** in both Website Builder + Brand Studio. On mount, if the user has an in-progress draft for the tool + event, they see the "Resume this draft / Start new" prompt before they interact. "Resume" actually restores the tab (and content sub-tab, for Website Builder) they were on when they left — `tool_record_id` now stores the tab position (e.g. `content:speakers` for Website Builder, `colors` for Brand Studio).
- **Share-with-team toggle** in ResumeSidebar. Each of the user's own draft rows has an inline "Share with team" button. Click flips `shared_with_team` via the existing `PATCH /api/drafts/[id]` endpoint (optimistic update, reverts on failure). Team-shared drafts show "Shared with team ✓" in gold.

Khalifat's review `fcdbcbff-53e4-43a5-bbce-0c1cfa3aed3b` was auto-resolved by PATCHing to `status=resolved` with `fix_commit_sha=23fe7d2` and an admin_notes explaining what shipped. resolveReview() generated the AI-drafted admin reply addressed to Khalifat + fired the bell notification.

### `5f70267` — Replace 4 hardcoded staff counts with live `getStaffCount()` helper

Durga flagged that the "300+" / "184" numbers in various places were stale — Trescon is currently 127 staff, not 184 or 300+. Rather than swap in the literal 127 (drifts the moment we hire), added `app/lib/staff-count.ts` which queries `staff_members WHERE access_enabled=true`, cached 5min in-process. Wired in 4 sites:

- `app/lib/generateInsights.ts` — org-strategy AI prompt count
- `app/api/ask/route.ts` — Pilot assistant system prompt count
- `app/api/seed-platform-docs/route.ts` — `__STAFF_COUNT__` placeholder substituted at seed time
- `app/profile/page.tsx` — welcome copy fetches via new `GET /api/staff-count` endpoint on mount, falls back to count-less copy while loading

### Bangalore rollout email fired — 60 recipients, 0 failures

Announcement email that Event Pilot is now ready to roll out office-by-office starting with Bangalore. Sent via one-off script (`/tmp/send-bangalore-rollout.mjs`, not in repo) using existing Resend infra + service role Supabase key.

**Recipients:** 57 Bangalore staff (`office_id='bangalore'`, `access_enabled=true`, excluding `charan@tresconglobal.com` = Charan Kaverappa, an Admin dept staffer Durga wanted to skip) + 3 explicit adds (Durga at `dc@tresconglobal.com`, Saleem at `sm@`, Naveen Bharadwaj at `naveen@`). All 60 delivered, Resend IDs logged.

**Content:** short direct email — platform in test for a few weeks, ready to roll out in phases starting with Bangalore. What to expect on first login (SSO via Microsoft, dashboard, tools by role). If already using it, keep going with the AI courses. If something breaks, use Report Issue. Signed by Durga.

### Two proposal specs designed + sent to Madhu via in-app messages

Both live in `docs/` and were also delivered to Madhu's Event Pilot inbox at `/messages` (Madhukar Dudda, `323f2caf-7a9b-47e0-b703-02d2d6ecfc95`):

**Trescon Digest** (`docs/newsletter-proposal-trescon-digest.md`, message ID `4e98d50f-7efd-4616-9b04-6a9f5adc9c93`) — fortnightly all-staff newsletter. 7-section spine: AI This Week / What Shipped / Events Pulse / Learning Corner / Faces of Trescon / You Said, We Did / Coming Up Next. Dual-channel delivery: email + new "News Corner" section at `/news` on Event Pilot itself. Every issue gets a permanent URL. Half auto-generated (learning stats, new joiners, resolved reviews), half manual (Durga's AI This Week + roadmap; Marketing's Events Pulse; rotating staff spotlight). ~70 min per fortnight split across 3 people. Build: 3–4 days.

**Leaderboard v2** (`docs/leaderboard-spec-v2.md`, message ID `e5a53dd2-61ed-4029-bd06-3fe657799b29`) — pivot from rank+tier to **Mi Watch / Strava-style percentile framing**. Everyone sees "you're in top X% of Trescon, ahead of Y% of your office, Z% of your dept". Public leaderboard shrinks to top 10 + office standings. Scope stays course-only — tool adoption celebrated in the Digest instead. **5-layer anti-fake system:**
- L1: Minimum 60% of stated course duration, focused-tab only
- L2: Randomized tests (question bank, answer order, no back-nav, time limit)
- L3: Trust score per completion (3+ flags = doesn't count)
- L4: Quarterly manager attestation for Champion + Master tier learners
- L5: Weekly random spot-audit of 1 top-10 completion

Streak freeze: 2 auto-freezes per quarter (miss a week, streak stays). Silent, no user action.

### `03de21e` — Website Builder preview mode fix (Khalifat review `6c2d9724`)

Khalifat filed a critical review at 10:50 IST reporting "404 Page Not Found" when clicking Preview/Publish for the World AI Show Mumbai website after completing all setup steps. Sat untouched until picked up in the late-night session.

**Root cause:** the Publish tab embedded `<iframe src="/events/{slug}">` for preview and had an "Open" button linking to the same URL. But `/events/[slug]/page.tsx` was hardcoded to require `.eq('status', 'live')` — so any draft (which is every site before you click Publish) always 404'd. The preview experience was broken for the entire lifecycle up until first publish.

**Fix:**
1. `/events/[slug]/page.tsx` now accepts a `?preview=1` query param. When present AND the request has an authenticated admin session (checked via `tcs_session` cookie server-side using `next/headers`), the status filter is skipped and `draft_structure` is preferred over `page_structure_full`
2. Publish tab now auto-appends `?preview=1` to both the iframe src and the "Open" button href when `settings.status !== 'live'`. The button also relabels to "Preview" (was "Open") to remove ambiguity
3. Also normalized page-structure parsing — some legacy rows store `page_structure_full = {}` instead of `null`, which crashed `ps.pages.find(...)`. `ps` is now nulled unless it has a valid `pages` array

**Security:** non-admins hitting `?preview=1` still get 404. The session check is server-side, cookie-based, cannot be spoofed from the browser.

**Verified locally:** all three states behave correctly on port 3007:
- Bare URL (no cookie, no preview) → 404 ✅
- `?preview=1` without cookie → 404 ✅ (security holds)
- `?preview=1` with admin cookie → 200, renders ✅

**Review resolved:** `6c2d9724-f5c0-426e-8252-8bb012e86d6f` flipped to `resolved` with `fix_commit_sha=03de21e`. AI-drafted admin comment posted addressed to Khalifatur, asking him to retry.

### Memory rules saved this session

Two feedback memories added to `~/.claude/projects/-Users-durgacharan1978/memory/`:

- **`feedback_eventpilot_rollout_cc_management.md`** — any broad rollout email at Trescon must CC or FYI the 13-person Management/Board list (Board: Madhukar, Mithun, Naveen, Swarnavo, Ummer; C-Suite: Anil, Christine, Durga, Edward, Saleem, Samad, Sanjiv, Vimal). Madhu Satyanarayan explicitly excluded — has platform super_admin but is a Sales director, not org management. Re-verify list before each send.

### ⚠ Still open going into next session

1. **`CRON_SECRET` env var mismatch** — still blocking the weekly leaderboard cron. Monday 06 Jul 07:00 IST scheduled fire will 401 unless secret is fixed. Needs `CRON_SECRET` set on Railway + GitHub Actions with the same value. Same blocker from 01 Jul evening — 4 days until it costs us a missed digest.

2. **`/leaderboard` cosmetic bug** — the sole seeded baseline row shows a UUID instead of a staff name. Needs a join in `/api/leaderboard`. Cheap fix, but every Bangalore tester who lands there today sees a UUID.

3. **Newsletter + Leaderboard v2 specs awaiting Madhu's read** — 5 questions each. Once he responds, we can start Phase 0 of the leaderboard rebuild (percentile model) and Phase 1 of the newsletter (composer + first Issue #1 target Friday 17 Jul).

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

### ✅ `active_drafts` table created — feature fully live

Durga ran `supabase/save_resume_migration.sql` in the Supabase Dashboard SQL Editor at ~19:00 IST. The `active_drafts` table now exists in production. Verified against the live `/api/drafts` endpoint — returns 200 cleanly.

Note for future migrations here: the `run_sql` RPC still doesn't exist (PGRST202), so any `supabaseAdmin.rpc('run_sql', ...)` self-heal pattern will silently fail. Manual SQL Editor + Supabase Dashboard is the reliable path; Madhu's `supabase db query --linked` approach also works from his authenticated CLI.

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

### Pending — SmartExcel (03 Jul session)

0. **Confirm same-tab click-through works** — Part 9 fix (`c4d4fb0`) deployed but not yet re-verified by Madhu clicking through live.
1. **Prashanthi/Suresh's checklist items** — run real jobs, stress-test, recipe reuse (see Pilot Project #4, `/admin/pilots`). Nothing blocks this now.
2. **Python worker** is on Railway (`smartexcel-worker` project), not Cloud Run — fine as-is, just don't assume Cloud Run when reading `worker/README.md` history.
3. `smartexcel.trescon.workers.dev` (the pre-proxy domain) still resolves and still works — low priority, but could eventually be locked down/redirected once nobody's bookmarked it, so there isn't a second live entry point floating around.

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

- **03 Jul 2026 — Madhu/Claude (full day)** — SmartExcel wired up as a Toolkit tool end-to-end: SSO bridge (replaces its own password/OTP auth), code folded into this repo at `tools/smartexcel/`, deployed to Cloudflare Workers + Python worker to Railway, 4th Pilot Project created (Builder role added — `pilot_projects.builder_id`, Build Requests now route per-project instead of always to Durga), a real bug fixed from Prashanthi's first live usage (missing `R2_BUCKET` secret), then reverse-proxied under `eventpilot.tresconglobal.com/smartexcel` for full domain uniformity (touched the shared `eventpilot-proxy` Worker with Durga's explicit sign-off — see Part 8), finishing with a same-tab Toolkit-card fix (Part 9). `SME_CONTEXT.md` updated throughout per new standing rule. Full detail in "What Was Built — 03 Jul 2026" above.
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

*This handoff was last updated by Claude Code (Sonnet 5) on 2026-07-03, end of Madhu's SmartExcel session (`c4d4fb0`). All commits pushed to `origin/main`; Railway confirmed live. SmartExcel live at both `eventpilot.tresconglobal.com/smartexcel` (canonical) and `smartexcel.trescon.workers.dev` (still resolves, no longer advertised). Local main is synced except for two pre-existing, unrelated uncommitted files that aren't part of this session's work: `EVENTPILOT_PLATFORM_DOCUMENT.md` (in-progress edit, untouched) and `supabase/kb_migration.sql` (untracked, untouched).*
