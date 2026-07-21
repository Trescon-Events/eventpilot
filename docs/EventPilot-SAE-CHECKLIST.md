# Stakeholder Announcement Engine — Build Checklist

Tracks execution of `docs/EventPilot-SAE-PRD-v1.0.md` (currently v1.2). Update checkboxes as items land — this is the source of truth for "what's done" across sessions, alongside `HANDOFF.md`.

**Architecture decisions locked in (differ from the PRD document's literal text — see Context in the plan file, `~/.claude/plans/magical-singing-rossum.md`):**
- Extend existing `event_speakers`/`event_sponsors` additively — do **not** create separate `event_partners`/`stakeholder_speakers` tables. `event_speakers`/`event_sponsors` already exist for Website Builder + KonfHub; confirmed live-but-empty (0 rows) before this decision.
- New API routes live under `app/api/events/stakeholders/*`, not flat under `app/api/events/*` — avoids colliding with the existing `app/api/events/speakers`/`sponsors` routes.
- Public assets (creatives, photos, logos, messaging PDFs) go in a public Supabase Storage bucket (`event-stakeholder-assets`, `app/lib/events/storage.ts`), not R2 — matches Website Builder's existing pattern, gives stable non-expiring URLs.
- Postiz (not Ayrshare), PhotoRoom (not remove.bg), plain pasted URL (not Google Maps API) — per PRD v1.1/v1.2.

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

- [ ] D1: `app/api/events/stakeholders/announcements/[id]/send-for-approval/route.ts` — creates `announcement_approvals` rows with `approval_token`/`token_expires_at` (7-day expiry, mirrors `staff_members.reset_token` pattern from `app/api/reset-password/route.ts`), sends Resend email (use the `RESEND_FROM`-based ad-hoc pattern from `app/api/content/posts/[id]/approve/route.ts`, not the broken `app/lib/email.ts`)
- [ ] D2: `app/admin/events/[id]/announcements/[id]/review/page.tsx` — must work with **no EventPilot session**, via `?token=`. Check `middleware.ts`'s protected-route matcher and add this path as a public exception (same treatment as `/events/[slug]`)
- [ ] D3: `app/api/events/stakeholders/announcements/[id]/approve/route.ts` — accepts staff session OR valid token; status-aggregation logic per PRD §6.9; MM notification email on completion

---

## Phase E — Postiz Deployment and Publishing

- [ ] E1a: **[Claude Code]** Add Postiz Docker service to the Railway project (`ghcr.io/gitroomhq/postiz-app:latest`, service name `postiz`)
- [ ] E1b: **[Claude Code]** Add `postiz-db` PostgreSQL service in Railway
- [ ] E1c: **[Claude Code]** Add Redis service in Railway (or configure Upstash free-tier URL)
- [ ] E1d: **[Claude Code]** Set all Postiz env vars per PRD §5b (DATABASE_URL, MAIN_URL/FRONTEND_URL/NEXT_PUBLIC_BACKEND_URL, JWT_SECRET, CLOUDFLARE_* reusing `KB_R2_*` values, REDIS_URL, EMAIL_PROVIDER/RESEND_API_KEY, DISABLE_REGISTRATION=true)
- [ ] E1e: **[Claude Code]** Enable Railway private networking between `eventpilot` ↔ `postiz` services
- [ ] E2: **[MADHU — manual]** Visit the Postiz URL, create the initial admin account (only step that can't be automated)
- [ ] E2: **[MADHU — manual]** Generate Postiz API key (Settings → API Keys)
- [ ] E3: Add `POSTIZ_INTERNAL_URL` and `POSTIZ_API_KEY` to EventPilot's Railway env vars (Claude Code sets these once Madhu supplies the key — do not touch Railway env vars without Madhu's explicit go-ahead per this project's standing rule)
- [ ] E4: `app/api/events/stakeholders/announcements/[id]/schedule/route.ts` — calls Postiz `POST /api/v1/posts` with `X-Profile-Key: event.postiz_profile_key`
- [ ] E4: `app/api/events/stakeholders/announcements/[id]/publish-now/route.ts` — same, omits `date`
- [ ] E5: `app/api/cron/announcements/sync-status/route.ts` — polls Postiz every 15 min via cron-job.org (`Authorization: Bearer` + `CRON_SECRET`, matching this repo's existing cron convention, not Railway cron)
- [ ] E6: **[MADHU — manual]** Create a "World AI Show Malaysia 2026" workspace in Postiz, connect LinkedIn + X via OAuth (Instagram blocked on Meta App Review, see below)
- [ ] E7: Social calendar view (tab within Stakeholder Hub) — month grid, coloured dots per stakeholder type, click for detail, next-available-day scheduling suggestion

**Separately, not blocking Phase E code:**
- [ ] **[MADHU — manual]** Submit Meta App Review for Instagram publishing (`instagram_basic`, `instagram_content_publish`, `pages_manage_posts`) — 2–4 week process, start this early since it's the long pole

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

1. `PHOTOROOM_API_KEY` — get from photoroom.com/api, add to `.env.local` + Railway
2. Verify `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET` are actually set (code exists, unconfirmed as configured)
3. Canva template design IDs for speaker + each partner-type template, for `canva_template_config`
4. Create Postiz admin account after Claude Code deploys it (Phase E2)
5. Generate Postiz API key, hand to Claude Code for env var setup
6. Connect social accounts in Postiz per event (OAuth login, LinkedIn/X first)
7. Submit Meta App Review for Instagram (start early — 2–4 weeks)
