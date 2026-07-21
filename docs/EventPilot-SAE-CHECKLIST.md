# Stakeholder Announcement Engine — Build Checklist

Tracks execution of `docs/EventPilot-SAE-PRD-v1.0.md` (currently v1.3). Update checkboxes as items land — this is the source of truth for "what's done" across sessions, alongside `HANDOFF.md`.

**Architecture decisions locked in (differ from the PRD document's literal text — see Context in the plan file, `~/.claude/plans/magical-singing-rossum.md`):**
- Extend existing `event_speakers`/`event_sponsors` additively — do **not** create separate `event_partners`/`stakeholder_speakers` tables. `event_speakers`/`event_sponsors` already exist for Website Builder + KonfHub; confirmed live-but-empty (0 rows) before this decision.
- New API routes live under `app/api/events/stakeholders/*`, not flat under `app/api/events/*` — avoids colliding with the existing `app/api/events/speakers`/`sponsors` routes.
- Public assets (creatives, photos, logos, messaging PDFs) go in a public Supabase Storage bucket (`event-stakeholder-assets`, `app/lib/events/storage.ts`), not R2 — matches Website Builder's existing pattern, gives stable non-expiring URLs.
- PhotoRoom (not remove.bg), plain pasted URL (not Google Maps API) — per PRD v1.2, unchanged since.
- **Postiz Cloud** (platform.postiz.com, managed SaaS, $39/mo Team plan) — not self-hosted. PRD v1.1/v1.2 originally called for self-hosted Postiz on Railway; v1.3 (2026-07-21) replaced that with the Cloud plan before Phase E was ever started, so no Railway deployment work happens for this module at all. `POSTIZ_API_URL=https://api.postiz.com` + `POSTIZ_API_KEY` (global) + per-event `postiz_profile_key` (workspace key).

---

## Phase A — Foundation ✅ (committed, corrected for v1.2)

- [x] A1: `supabase/sae_migration.sql` written and applied to live Supabase
- [x] A2: Event profile edit form extended (Digital Presence / Social Channels sections), `Event` type, `app/api/events/route.ts` select list
- [x] A3 (superseded by v1.2 §6.2):~~Venue map search~~ → plain `venue_map_url` text field + "View Map ↗" link — done
- [x] A4: Topline Messaging Doc card, upload + Gemini structured extraction, `app/api/events/stakeholders/messaging/{route,[id]/route}.ts`
- [x] PRD v1.2 correction pass: Ayrshare → Postiz naming, Google Maps route deleted, DB columns renamed live

**Outstanding from Phase A:**
- [ ] **Lint debt**: `app/admin/events/[id]/page.tsx` carries ~82 pre-existing raw-hex-color errors unrelated to SAE (predates this work). Fix in one dedicated pass before this branch can pass `npm run lint:changed` in CI. Not urgent — do this right before opening a PR, not mid-feature-build.
- [ ] Authenticated click-through of Phase A (edit form save/display, messaging doc upload) — blocked on having a working local login; do this once Phase B gives us a real reason to run the dev server end-to-end.

---

## Phase B — Stakeholder Registry ✅ B1–B4 committed

- [x] B1: `app/api/events/stakeholders/speakers/route.ts` + `[id]/route.ts` (GET/POST/PATCH/DELETE on `event_speakers`, field-name mapping full_name/job_title/company_name ↔ name/role/company)
- [x] B1: `app/api/events/stakeholders/partners/route.ts` + `[id]/route.ts` (same, on `event_sponsors`)
- [x] B2: `app/api/events/stakeholders/speakers/[id]/upload-asset/route.ts` — photo/logo upload to Supabase Storage, PhotoRoom call for photos
- [x] B3: `app/api/events/stakeholders/partners/[id]/upload-asset/route.ts` — logo upload, PNG/JPG/SVG/PDF/AI
- [x] `from-submission` routes for both speakers and partners
- [x] Added: `app/api/events/stakeholders/submissions/{route,[id]/route}.ts` — list + reject, not in the PRD's original file list but required by its own §9.4 spec
- [x] Added: `'archived'` to both tables' `announcement_status` CHECK — PRD's own spec (§6.4) asks for it, never defined it
- [x] B4: `app/admin/events/[id]/stakeholders/page.tsx` — Stakeholder Hub. Registered in `app/lib/registry/modules.tsx` (`admin-event-stakeholders`, matching `admin-event-brief`'s pattern — `breadcrumbPattern` only, no `breadcrumbParent`, since this is a page-badge-only event-scoped entry like Plan/Execution/Brief, not a separately toolkit-gated tool like Website Builder/Market Intel). Renders `PageHeader`. `npm run check:nav` passes.
- [x] B5: `app/public/forms/[event_id]/[form_type]/page.tsx` + `app/api/public/forms/[event_id]/[form_type]/route.ts` — public, unauthenticated. Server-side required-field + file-size validation, honeypot field. Added `/public` to `middleware.ts`'s `PUBLIC_PREFIXES` (the page route wasn't covered by the existing `/api/public` entry — real gap, would have redirected every external submitter to `/login`) and to `AuthedShellGate.tsx`'s `PREFIX_NO_SHELL`. **Verified end-to-end for real**: unauthenticated `curl` submission with a real JPEG landed correctly in `stakeholder_form_submissions` with a working public photo URL (test row cleaned up after).

**Env var still needed to actually test B2/B3's PhotoRoom call:** `PHOTOROOM_API_KEY` (Madhu to get from photoroom.com/api) — code no-ops gracefully (stores the original photo, skips background removal) if unset, doesn't error.

---

## Phase C — Canva Autofill ✅ C1–C2 committed

- [x] C1: Added `'autofill'` to `app/api/canva/design/route.ts`. Extracted token resolution + the full autofill pipeline (upload asset → autofill → export, each step properly polled) into `app/lib/canva.ts`, shared with C2's routes rather than a self-referential HTTP call.
- [x] C2: `app/api/events/stakeholders/announcements/generate/route.ts` — Gemini post-copy (grounded in the live messaging doc + real event/stakeholder fields only — no fabricated data like the PRD's "edition number," which doesn't exist as a real column) + Canva autofill via `events.canva_template_config` + creative re-uploaded to Supabase Storage (Canva's own export URL is temporary) + draft `stakeholder_announcements` row.
- [x] C2: `regenerate-copy`/`regenerate-creative` routes, sharing `app/lib/events/announcements.ts` (`generatePostCopy`/`buildAutofillFields`) rather than duplicating the generate route's logic.
- [x] Wired "Generate Announcement" in the Stakeholder Hub to a real `canva_staff_id`, resolved from the current session (`/api/auth/session`'s `sid` — the established client-side pattern used elsewhere, e.g. `RealtimeNotifications.tsx`).
- [ ] C3: Manual test — one real Canva template + one real (test) speaker record end to end. **Blocked** until Madhu provides real Canva template design IDs and confirms `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET` are actually set (code exists, was unconfirmed as configured) — code is written and typechecks/builds clean, but has not been exercised against the real Canva API.

**`canva_template_config` field-mapping convention** (not explicit in the PRD, decided while building C2): the JSONB's `fields` object maps a semantic key (`speaker_name`, `job_title`, `company`, `speaker_photo`, `company_logo` for speakers; `company_logo`, `tier_label` for partners) to the *actual* Canva template's field name, e.g. `{ "speaker_name": "Speaker Name" }`. This is what Madhu needs to fill in per template when supplying design IDs.

---

## Phase D — Approval Workflow

## Phase D — Approval Workflow ✅ committed, verified end-to-end

- [x] D1: `send-for-approval/route.ts` — `announcement_approvals` rows with `approval_token`/`token_expires_at` (7-day, mirrors `staff_members.reset_token`), Resend email via the `RESEND_FROM` pattern.
- [x] D2: `app/admin/events/[id]/announcements/[announcementId]/review/page.tsx` — note the path uses `[announcementId]`, not `[id]` as the PRD literally wrote it (`app/admin/events/[id]/announcements/[id]/review` reuses the same dynamic-segment name twice, which Next.js flatly disallows — real bug in the PRD's own file list, not a style choice). Reads `?token=` via the codebase's established `window.location.search` pattern (not `useSearchParams()`, which would need a Suspense boundary this codebase avoids elsewhere).
- [x] `review-data/route.ts` — dedicated read-only GET for the review page, not in the PRD's file list. Kept deliberately separate from the (still unbuilt) general announcement CRUD route so a token only ever unlocks exactly what an approver needs to see, not a wider surface.
- [x] D3: `approve/route.ts` — accepts `token` OR `approver_id`; status-aggregation (all approved/approved_with_comments → announcement approved; any changes_requested → changes_requested); MM notification email (to `stakeholder_announcements.created_by`).
- [x] `middleware.ts`: added regex exceptions (not simple prefixes — both routes have dynamic `[id]` segments) for `.../approve`, `.../review-data`, and the review page itself.
- [x] `AuthedShellGate.tsx`: extended with a small `REGEX_NO_SHELL` list (prefix/exact matching can't express a two-dynamic-segment path) so the review page never shows the internal admin chrome, for external approvers or staff alike.
- [x] `app/lib/registry/nav-exclusions.ts`: added the review page to `PAGEHEADER_EXEMPT` — it's a standalone layout like the public forms, just placed under `app/admin/**` by the PRD.
- [x] **Verified fully end-to-end against the live database**, not just typecheck: seeded a real test announcement + approval row, hit `review-data` unauthenticated (200, correct data), loaded the review page itself unauthenticated (200, not a redirect), POSTed a real approval decision unauthenticated (200, `announcement_status: "approved"`), confirmed both `stakeholder_announcements.status` and `announcement_approvals.status` updated correctly in the DB, then deleted all test rows.

**Note**: the PRD's own text (§6.9) mentions the token being "HMAC-signed with JWT_SECRET" — the actual implementation uses a random opaque token stored in the DB (mirroring `reset_token`), per the plan decision made before Phase A ("reuse the existing pattern... rather than pulling in JWT/signing libraries"). No `JWT_SECRET` env var needed.

---

## Phase E — Postiz Cloud Integration ✅ code committed, blocked on Postiz account for live testing

**PRD v1.3 correction (2026-07-21): self-hosted Postiz → Postiz Cloud (platform.postiz.com, Team plan $39/mo).** No Railway deployment, ever — this whole phase was never started, so there was no code to fix, only this checklist's now-obsolete deployment items (removed below). Postiz Cloud's Meta/Google apps are pre-approved, so Instagram/YouTube connect immediately — no Meta App Review wait.

- [x] `app/lib/postiz.ts` — shared client (`schedulePostizPost`/`getPostizPostStatus`), used by all three routes below.
- [x] E1: `app/api/events/stakeholders/announcements/[id]/schedule/route.ts` — validates `approved`/`approved_with_comments` status + a configured `postiz_profile_key` before calling Postiz; stores `postiz_post_id`, sets `status: 'scheduled'`.
- [x] E2: `app/api/events/stakeholders/announcements/[id]/publish-now/route.ts` — same validation, omits `date`. Deliberately still lands on `status: 'scheduled'` (with `scheduled_for = now`), not `'published'` directly — Postiz accepting the request confirms it was queued, not that it's actually live on every platform; the sync-status cron confirms real publication for both paths uniformly.
- [x] E3: `app/api/cron/announcements/sync-status/route.ts` — polls every `scheduled` announcement past its `scheduled_for` with a `postiz_post_id`, marks `published`/`failed`, emails the MM on failure. `Authorization: Bearer CRON_SECRET`, matching the existing cron convention.
- [x] E4: `app/api/events/stakeholders/announcements/route.ts` (list/calendar query, not in the PRD's file list but required by E4's UI — same gap pattern as the earlier `submissions` list route) + `CalendarView.tsx`, wired into the Stakeholder Hub as a Registry/Calendar toggle. Month grid, coloured dots (speaker=indigo, partner=amber), click for detail, next-available-day suggestion.

**Verification**: `npx tsc --noEmit`, `npm run build`, `npm run check:nav`, eslint all clean. Route-level auth guards (staff-only, not public) confirmed via curl (307 to `/login` unauthenticated, correct). Could not exercise the real Postiz call path or the schedule/publish-now success path — blocked on Madhu's Postiz Cloud account existing at all (see below). Validation-branch logic (`422` for wrong status / missing profile key) is simple and deterministic, verified by reading rather than live-testing.

**[MADHU — manual, in parallel with E1–E4]:**
- [ ] Sign up at platform.postiz.com, Team plan ($39/month)
- [ ] Generate a global API key (Settings → API Keys) → `POSTIZ_API_KEY`
- [ ] Create a "World AI Show Malaysia 2026" workspace, connect LinkedIn/X/Instagram/YouTube via OAuth (all connect immediately on the Cloud plan, no approval wait)
- [ ] Generate a workspace API key → paste into the event's "Postiz Profile Key" field in EventPilot
- [ ] Give Claude Code `POSTIZ_API_URL=https://api.postiz.com` and the global `POSTIZ_API_KEY` to add to `.env.local` + Railway (Railway env var changes still need your explicit go-ahead in the moment, same as the Canva credentials)

---

## Phase F — End-to-End

- [ ] F1: Announcement generator slide-over panel in Stakeholder Hub (PRD §9.5) — post copy editor, creative preview, approver selection, Skip Approval / Send for Approval actions
- [ ] F2: Wire generate → approve → schedule end-to-end
- [ ] F3: Create "World AI Show Malaysia 2026" sandbox event; seed 2–3 test speakers + 1–2 test partners; full manual click-through, one speaker + one partner, real Postiz publishing gated off until Madhu confirms social accounts are connected

---

## Before merging to `main`

- [ ] Fix the pre-existing lint debt in `app/admin/events/[id]/page.tsx` (flagged above, Phase A)
- [ ] Full `npm run typecheck` / `npm run lint:changed <base>` / `npm run check:nav` / `npm run build` pass on the whole branch
- [ ] Authenticated browser click-through of the complete flow (not just build/typecheck) — get working local credentials sorted first
- [ ] Confirm the existing Website Builder speaker/sponsor flow and the live `AI-2047-2026` public site are unaffected (re-check before/after)
- [ ] Madhu + Durga review before push (this is a platform-wide, multi-integration change — same discipline as the nav/branding CI work)

---

## Manual action items — full list (for Madhu)

1. `PHOTOROOM_API_KEY` — get from photoroom.com/api, add to `.env.local` + Railway. **Still open.**
2. ~~Verify `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET`~~ — **done 2026-07-21.** Existing "Event Pilot" Canva Integration found, scopes extended (`brandtemplate:meta:read`, `brandtemplate:content:read`), credentials set in `.env.local` + Railway, staff OAuth connection verified live (`canva_tokens` row confirmed).
3. **Canva Brand Templates exist and are correctly published** ("Speaker Announcement" `EAHP--AjjpQ`, "Sponsor-Partner Announcement" `EAHP-3_f4DM`, both Instagram Post 4:5 = 1080×1350px) — confirmed live via `GET /v1/brand-templates`. **Blocked**: `GET /v1/brand-templates/{id}/dataset` returns `{}` for both — neither template has any element marked as an autofill-able **data field** yet. Madhu needs to open each in Canva's editor and add data fields for: speaker photo, speaker name, job title, company (Speaker Announcement); logo, tier label (Sponsor-Partner Announcement). Exact click path in Canva's UI not yet confirmed — in progress.
4. ~~Deploy/create Postiz admin account~~ — **not applicable**, PRD v1.3 moved to Postiz Cloud (platform.postiz.com), no self-hosting.
5. Sign up at platform.postiz.com (Team plan, $39/mo), generate global `POSTIZ_API_KEY` + per-workspace key for WAIS Malaysia, hand both to Claude Code.
6. Connect LinkedIn/X/Instagram/YouTube in the Postiz Cloud workspace (all connect immediately on the Cloud plan — pre-approved Meta/Google apps, no review wait).
7. ~~Submit Meta App Review~~ — **not needed**, Postiz Cloud's own Meta app is pre-approved.

**Note on Railway billing (found + resolved 2026-07-21):** Railway auto-deploy had silently stopped since 2026-07-17 due to a payment lapse — every push to `main` since then (including this morning's CI/nav-branding work) sat undeployed until Madhu cleared the payment and Claude Code force-triggered a fresh deploy (`railway redeploy --from-source`). Worth a quick sanity check that nothing else was expected to be live from that window.
