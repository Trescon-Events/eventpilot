# Stakeholder Announcement Engine — Build Checklist

Tracks execution of `docs/EventPilot-SAE-PRD-v1.0.md` (currently v1.4). Update checkboxes as items land — this is the source of truth for "what's done" across sessions, alongside `HANDOFF.md`.

**Architecture decisions locked in (differ from the PRD document's literal text — see Context in the plan file, `~/.claude/plans/magical-singing-rossum.md`):**
- Extend existing `event_speakers`/`event_sponsors` additively — do **not** create separate `event_partners`/`stakeholder_speakers` tables. `event_speakers`/`event_sponsors` already exist for Website Builder + KonfHub; confirmed live-but-empty (0 rows) before this decision.
- New API routes live under `app/api/events/stakeholders/*`, not flat under `app/api/events/*` — avoids colliding with the existing `app/api/events/speakers`/`sponsors` routes.
- Public assets (creatives, photos, logos, messaging PDFs) go in a public Supabase Storage bucket (`event-stakeholder-assets`, `app/lib/events/storage.ts`), not R2 — matches Website Builder's existing pattern, gives stable non-expiring URLs.
- PhotoRoom (not remove.bg), plain pasted URL (not Google Maps API) — per PRD v1.2, unchanged since.
- **Postiz Cloud** (platform.postiz.com, managed SaaS, $39/mo Team plan) — not self-hosted. PRD v1.1/v1.2 originally called for self-hosted Postiz on Railway; v1.3 (2026-07-21) replaced that with the Cloud plan before Phase E was ever started, so no Railway deployment work happens for this module at all. `POSTIZ_API_URL=https://api.postiz.com` + `POSTIZ_API_KEY` (global) + per-event `postiz_profile_key` (workspace key).
- **Sharp compositing, not Canva Autofill** (PRD v1.4, 2026-07-21) — see the superseded Phase C section below for why. Canva OAuth stays in the codebase for future use, just not called during creative generation.
- **Named creative variants, each an ordered layer stack** — not a single background + fixed zones (PRD v1.4 Phase C v3, 2026-07-21, same day). Real creatives have genuine z-order between elements (e.g. a photo sitting under a translucent foreground for a feathered blend); see the Phase C v3 section below.
- **`postiz_profile_key` and `creative_template_config` stay per-event, not moved to a higher "Event Series/brand" level** — considered and explicitly rejected 2026-07-21. Brainstormed grouping recurring event brands (World AI Show, AJMS CXO Boardroom, etc.) into a series so their social channels/templates get configured once and reused across editions; Madhu's call was that not every event belongs to a recurring series, and standalone one-off events still need their own keys — so per-event stays the rule, no new `event_series` concept. This already matches what's built: `postiz_profile_key` sits in the same event-edit-form section as the `social_linkedin`/`social_x`/etc. fields (`app/admin/events/[id]/page.tsx`), so whoever updates an event's social channels updates its Postiz key in the same place. If a real duplication-effort problem shows up in practice across many editions of the same brand, revisit this — the reasoning here was about correctness for one-offs, not a verdict that series-level config could never be useful.

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

## Phase C v1 — Canva Autofill ❌ ABANDONED 2026-07-21, superseded by Sharp (below)

Built and committed (C1/C2 below), then **investigated live with Madhu and confirmed non-viable**: the "Connect data" option needed to mark a Brand Template's elements as fillable does not appear on image or text elements in the standard Canva for Teams editor, even on genuinely-published Brand Templates. Confirmed two ways: (1) hands-on in Canva's editor, no such option found; (2) programmatically — got a real OAuth connection working end-to-end (scopes fixed, credentials verified, `GET /v1/brand-templates` returned both real WAIS Malaysia templates correctly), then `GET /v1/brand-templates/{id}/dataset` returned `{}` for both — zero fillable fields exist on either template. Canva's Autofill API requires a specific enterprise developer workflow to set up data fields that isn't reachable from the standard editor. This work is **not deleted from history** — kept here for the record — but the actual code has been removed from the branch (see Phase C v2).

- [x] C1: Added `'autofill'` to `app/api/canva/design/route.ts` + `runCanvaAutofill`/`pollCanvaJob` in `app/lib/canva.ts` — **removed** in the v2 rework; `getCanvaAccessToken` and the original five actions (upload/create/export/status/check) kept as-is, Canva OAuth stays for future use.
- [x] C2: `generate`/`regenerate-copy`/`regenerate-creative` routes built calling Canva autofill via `events.canva_template_config` — **reworked** in v2 to call Sharp instead.
- [x] Canva OAuth connection itself fully debugged and verified working (scopes, credentials, live token) — this groundwork is NOT wasted, it stays in place for whatever future use the OAuth integration gets.
- [x] Also fixed along the way: Railway auto-deploy had silently stopped since 2026-07-17 (payment lapse, unrelated to Canva) — found and resolved during this investigation.

---

## Phase C v2 — Sharp Compositing (single background + fixed zones) — superseded by v3, below

Built and verified end-to-end (C3 test below), then **superseded the same day**: looking at a real WAIS Malaysia creative, Madhu identified that real designs have independently-positioned elements with genuine z-order between them (e.g. a speaker photo sitting *under* a translucent foreground layer to get a feathered blend) — a single background PNG + fixed photo/logo/text zones can't express that. Not deleted from history — the Sharp-compositing *approach* (server-side, Canva stays the design tool for layer assets) carries forward unchanged into v3; only the config shape (fixed zones → an ordered layer stack) changed.

- [x] DB: `ALTER TABLE events RENAME COLUMN canva_template_config TO creative_template_config;` + `ALTER TABLE stakeholder_announcements DROP COLUMN IF EXISTS creative_canva_id;` — applied live and verified via `information_schema.columns`; `supabase/sae_migration.sql` updated to match with a header-comment history entry.
- [x] `npm install sharp` + `npm install react-image-crop` — both confirmed in `package.json` (`sharp@^0.35.3`, `react-image-crop@^11.1.2`).
- [x] Removed Canva Autofill code: `runCanvaAutofill`/`pollCanvaJob`/`CanvaAutofillField` deleted from `app/lib/canva.ts` (kept `getCanvaAccessToken` for the surviving 5 actions), `'autofill'` action removed from `app/api/canva/design/route.ts`, `buildAutofillFields`/`TemplateFieldMap`/`CanvaTemplateConfig` replaced by `buildCompositeInputs`/`CreativeTemplateConfig` in `app/lib/events/announcements.ts`.
- [x] New `app/lib/announcements/composite.ts` — `compositeAnnouncement()`, adapted from PRD §7 using real `uploadPublicAsset()` URLs (not the PRD sample's placeholder `r2:` scheme).
- [x] New `app/api/events/templates/upload/route.ts` (background PNG upload → Supabase Storage, `{r2_url}` response) + `app/api/events/templates/route.ts` (GET current `creative_template_config`).
- [x] Reworked `generate/route.ts` + `regenerate-creative/route.ts`: select `creative_template_config`, call `buildCompositeInputs()` → `compositeAnnouncement()` → `uploadPublicAsset()`, dropped `canva_staff_id` from both request bodies entirely, dropped `creative_canva_id`/`canva_edit_url` from insert/response.
- [x] Stakeholder Hub (`app/admin/events/[id]/stakeholders/page.tsx`): removed `canva_staff_id` from `generateAnnouncement()`'s body, removed the now-dead `staffId` state + its `/api/auth/session` mount effect.
- [x] New "Creative Templates" section in the event profile edit form (`app/admin/events/[id]/page.tsx`) — upload buttons for Speaker/Partner backgrounds (via `uploadTemplateBackground()`, auto-merges the returned URL into the right slot of the JSON draft) with preview thumbnails, plus a "Layout Config" `<textarea>` for the raw `creative_template_config` JSON with parse-error display (`saveEventEdit()` validates JSON before PATCHing). No visual coordinate-picker, per PRD §8's own scope call for the pilot.
- [x] Speaker photo crop/zoom tool: new `app/api/events/stakeholders/speakers/[id]/crop-photo/route.ts` (Sharp `.extract()` server-side against pixel coords, re-uploads, updates `photo_processed_url`) + new `app/admin/events/[id]/stakeholders/PhotoCropModal.tsx` (`react-image-crop` drag/resize UI, scales displayed-image coords to natural pixel dimensions before posting). Wired into `stakeholders/page.tsx`'s `uploadAsset()` — opens automatically after a speaker photo upload if `photo_processed_url` is set. **Speaker photos only — never partner logos**, confirmed.
- [x] C3: Manual test — **run for real** against the live dev server and live Supabase (not Madhu's real Canva export, a disposable synthetic one, since the goal here was verifying the compositing pipeline itself, not final creative approval): uploaded a solid-color 1080×1350 PNG via `/api/events/templates/upload`, set a real `creative_template_config` (photo_zone + name/title/company text layers) on a real event, seeded a disposable test speaker + photo, called `/api/events/stakeholders/announcements/generate` for real (201, real `creative_url`), downloaded and visually confirmed the composited PNG — photo positioned/sized correctly in its zone, all three text layers rendered in the right position/color/weight. All test rows (DB) and objects (Storage) deleted afterward. **Still blocked** on Madhu's real Canva-exported background PNGs + final layout coordinates for the actual production templates — this test only proves the pipeline works, not the final creative design.

---

## Phase C v3 — Multi-Layer Creative Editor (PRD v1.4, current)

`events.creative_template_config` now holds named **variants** per stakeholder type, each an ordered stack of **layers** (`image` / `photo_slot` / `text`), composited bottom-to-top. Photo/logo blending into a background (the feathered-edge case) is achieved purely by layer order + the uploaded PNG's own alpha channel — Sharp's `.composite()` already respects per-layer alpha, no custom masking code was needed. Four scope decisions confirmed with Madhu via AskUserQuestion (all "recommended" chosen): up/down-button reordering (not drag-and-drop), server-rendered live preview (not a client-side approximation), multiple named variants per stakeholder type, and alpha baked into the Canva export (not parametric in-app feather controls). Full architecture in `~/.claude/plans/magical-singing-rossum.md`.

- [x] DB: `ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS creative_variant_id TEXT;` — applied live, verified via `information_schema.columns`. `events.creative_template_config` itself needed no ALTER (still JSONB, only its internal shape changed); `supabase/sae_migration.sql` updated with a header-comment history entry + the new CREATE TABLE column.
- [x] `app/lib/announcements/composite.ts` — full rewrite: `Layer`/`Variant`/`CreativeTemplateConfig` types, canvas now starts blank (`sharp({create:...})`) and every layer (background art included) is one ordered `OverlayOptions` entry, so mixed z-ordering between images/photos/text is respected exactly (the old batched-SVG-at-the-end approach couldn't do this).
- [x] `app/lib/events/announcements.ts` — `buildCompositeInputs()` reworked to resolve a `Variant` (by `variant_id`, defaulting to the first configured), scan its layers for the distinct `photo_slot` sources actually referenced (not all three always required), and 422 with a clear message if a referenced source has no uploaded asset.
- [x] `generate/route.ts` + `regenerate-creative/route.ts`: accept optional `variant_id`, fetch buffers for every resolved source (was: one), store `creative_variant_id` on the row so regenerate can reuse it without re-picking.
- [x] Fixed a real bug surfaced by this rework: `templates/upload/route.ts` always wrote to a fixed `${type}-bg.png` path, silently overwriting any previous upload — fine when there was only ever one background, broken once a stakeholder type has many layer images across variants. Fixed with a unique path per upload; response key renamed `r2_url` → `url` (no external consumers).
- [x] New `app/api/events/templates/preview/route.ts` — runs the real Sharp pipeline against a **draft, unsaved** variant, returns a base64 data URL, nothing persisted. Uses a real speaker/partner's photo+text if `speaker_id`/`partner_id` is given, otherwise flat-color placeholder boxes + sample text, so the MM can preview before any real stakeholder data exists.
- [x] New `app/api/events/templates/variants/route.ts` — `PUT`, targeted update of just `creative_template_config.<type>.variants`, decoupled from the giant event-edit form's PATCH so saving speaker variants can never clobber partner variants.
- [x] New `app/admin/events/[id]/creative-templates/page.tsx` — full-page layer editor: speaker/partner tabs, variant list (add/rename/delete), per-variant layer list (add image/photo-slot/text, move up/down, inline property panel, delete), debounced (500ms) live preview pane with a "preview with" real-stakeholder selector. Registered in `app/lib/registry/modules.tsx` (`admin-event-creative-templates`, same shape as `admin-event-stakeholders`) — `npm run check:nav` passes clean, no baseline exemption needed.
- [x] Removed the v2 JSON-textarea/upload-button section from `app/admin/events/[id]/page.tsx`, replaced with a "Manage Creative Templates →" link to the new page — the dedicated editor now owns saving this data, the giant edit form doesn't compete for the same JSONB column.
- [x] Stakeholder Hub (`stakeholders/page.tsx`): fetches available variants per stakeholder type; shows a `<Select>` next to "Generate Announcement ▶" only when more than one variant exists for that type, passes the chosen `variant_id` through.
- [x] C3 test — **run for real**, extending the v2 test to actually prove z-order/blending (not just non-overlapping zones): built a 4-layer variant (background image → photo_slot → a second image layer with a semi-transparent band crossing the photo zone → name text), uploaded both image layers through `templates/upload` (confirmed the overwrite-bug fix — two distinct URLs), saved via `templates/variants`, tested `templates/preview` twice — once with a fully-opaque overlay (confirmed later layers correctly occlude the photo layer) and once with a 50%-alpha overlay (sampled pixels matched the exact expected alpha-blend math, e.g. `(197,69,202)` for 50% magenta over placeholder gray `(140,140,150)` — precise to the pixel). Then ran the full `generate` endpoint with a real speaker (201, `creative_variant_id` stored correctly, final composite visually confirmed: photo placed, foreground layer correctly drawn on top, name text rendered). All test DB rows and Storage objects deleted afterward.

**Still pending from Madhu (unchanged by this pivot):** Postiz Cloud workspace connect (LinkedIn/X/Instagram/YouTube OAuth — see Phase E). `PHOTOROOM_API_KEY` and `POSTIZ_API_KEY`/`POSTIZ_API_URL` **received and set in `.env.local`** (2026-07-21) — not yet on Railway, needs explicit go-ahead. Real Canva-exported layer images (backgrounds, feathered foregrounds) + final pixel coordinates for the actual WAIS Malaysia production templates — Madhu is reviewing the source designs' real layer structure to inform this.

**Known gap, flagged rather than silently skipped:** no browser-automation tool is available in this session, so the new editor page's own interactivity (clicking move-up/down, editing layer properties, watching the preview update) hasn't been click-tested by Claude Code — only the underlying API routes and the final rendered output were verified. A manual click-through by Madhu/Durga is recommended before this is relied on for real production creatives, same caveat already on record for Phase A.

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

1. ~~`PHOTOROOM_API_KEY`~~ — **done 2026-07-21.** Key handed over, set in `.env.local`. **Not yet on Railway** — needs explicit go-ahead before setting there.
2. ~~Verify `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET`~~ — **done 2026-07-21.** Existing "Event Pilot" Canva Integration found, scopes extended (`brandtemplate:meta:read`, `brandtemplate:content:read`), credentials set in `.env.local` + Railway, staff OAuth connection verified live (`canva_tokens` row confirmed).
3. ~~Canva Brand Template Autofill~~ — **moot**, PRD v1.4 dropped Autofill entirely for Sharp compositing (see Phase C v2). Superseded by item 8 below (multi-layer creative editor) — Madhu is now looking at each source design's actual layer structure to inform that build, not hunting for a Canva data-field option that doesn't exist.
4. ~~Deploy/create Postiz admin account~~ — **not applicable**, PRD v1.3 moved to Postiz Cloud (platform.postiz.com), no self-hosting.
5. ~~Sign up at platform.postiz.com, generate `POSTIZ_API_KEY`~~ — **done 2026-07-21.** Global API key handed over, set in `.env.local`. **Not yet on Railway.** Per-event/workspace `postiz_profile_key` still pending — that's entered per-event in the EventPilot UI itself (event profile edit form), not an env var.
6. Connect LinkedIn/X/Instagram/YouTube in the Postiz Cloud workspace (all connect immediately on the Cloud plan — pre-approved Meta/Google apps, no review wait). **Still open.**
7. ~~Submit Meta App Review~~ — **not needed**, Postiz Cloud's own Meta app is pre-approved.
8. **New (2026-07-21): multi-layer creative editor.** Real WAIS Malaysia creatives (e.g. the "Speaking At" design) have several independently-positioned elements — background gradient, decorative headline text, a static event-branding block, a speaker photo with a feathered edge blending into the background, a CTA button, and a bottom info bar — not just "one background PNG + a photo zone + text fields." Madhu is reviewing the actual Canva layer structure of the source designs to scope this properly before it's built. See the architecture discussion below/in-session for the proposed design (named creative variants, each an ordered stack of layers — image/photo-slot/text — reorderable and positioned per layer, live preview). **Blocks Phase C3's real-template test** — the single-background `composite.ts` built so far proves the pipeline works but won't reproduce these real designs until this lands.

**Note on Railway billing (found + resolved 2026-07-21):** Railway auto-deploy had silently stopped since 2026-07-17 due to a payment lapse — every push to `main` since then (including this morning's CI/nav-branding work) sat undeployed until Madhu cleared the payment and Claude Code force-triggered a fresh deploy (`railway redeploy --from-source`). Worth a quick sanity check that nothing else was expected to be live from that window.
