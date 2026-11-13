# Public figures: approved post-event stats and facts for every public document

**Date:** 12 Nov 2026. Discussed and agreed with Madhu (12 Nov). Proposed build.
**Depends on:** Copy Library (`copy-library.md`) merged, plus the pending Copy Library fixes.
**Builds on:** `copy-library.md` (bundled client review via token link, `copy_requires_client_approval`, usages and live/sent consumers, audit pattern), `rules-screen-and-trescon-layer.md` (`validateText`, effective rules).

---

## 1. Why

Post-event figures ("6,500+ footfall", "50+ MoUs", "USD 32.5mn PR value") get typed into post-event reports, YouTube descriptions, website pages, social posts and next year's decks. Each copy is typed by hand, nobody records who approved the number, and the PDF report becomes the only record. In the BSS 2025 report text, the role percentages have come apart from their labels, and the social stats on page 51 have no platform labels. Nobody can reuse those numbers safely.

Public figures gives each event one approved, locked set of the figures and facts it is allowed to say publicly. Clients and internal reviewers approve, reject or suggest an edit on each figure through a link. Every downstream tool reads only the approved set.

### What the two reviewed reports showed (12 Nov)
- **DFS 2025:** ~20 headline figures, 8+ percentage breakdowns, investor AUM and ticket sizes, FinTech World Cup funnel, MoUs, media (9 metrics incl. PR value) and digital by channel.
- **BSS 2025:** 8 headline figures, a programme structure line (1 plenary · 4 tracks · 20 sessions), a policy launch, 3 breakdowns, Skillathon funnel with named winners, awards, media (7 metrics) and social totals.
- The sets differ between events and between editions of the same event (DFS 2023/2024/2025). The same idea also gets a different label at each event ("participants" vs "footfall"). **So: no fixed field list. Use a starter template the producer edits, plus a catalogue key behind each item so figures can be compared across events later.**

---

## 2. Decisions (Madhu, 12 Nov)

1. **Public only.** This build covers figures, stats and facts that go into public documents: post-event reports, video descriptions, website, social, press. **Actuals and targets are internal**, used later for analytics, and are **out of scope**. They must never mix with public figures (§3.1).
2. **Display value typed by hand.** No rounding rule. The producer types exactly how the figure should appear: "6,500+", "6,245", "USD 4 trillion+", "1.1 B". No separate numeric "real" value is stored here, because that would be an internal actual.
3. **Client suggestions:** the producer accepts or counters each one. If the producer accepts the client's exact suggestion, the item is approved with no second round. If the producer changes anything, the item goes back to the client in the next round.
4. **Testimonials:** later phase (they need the speaker's consent, which is a different approval).
5. **No backfill** of 2025 editions. Instead, a **starter template** combining the DFS and BSS structures is offered to every event. The producer keeps what they need, fills values, removes the rest and adds their own (§5).

---

## 3. Non-negotiables

1. **Public and internal are separate homes.** Public figures get their own tables (`event_public_figures*`). When internal actuals and targets are built later, they get **separate tables and a separate, permission-gated tab**. No shared table with a visibility flag, so a query can't leak an internal number into a public document by accident.
2. **Tools only read approved values** (`approved_payload`). A draft, an item in review or an edited working copy is never used.
3. **Approved = locked.** Changing an approved item needs **Reopen**, with a reason. It creates a new version. Consumers keep the last approved version until the new one is approved.
4. **Additive only.** No change to any output for DFS, FSF, FIFF, FTF, DFWS or BSS. No consumer reads public figures unless approved items exist for that event.
5. **Every write is audited** (who, when, before, after, reason), same pattern as `validation_rule_changes` / Copy Library.
6. **Do not resurrect `cm_statistics`.** The corporate marketing module was scrapped on 16 Oct (`docs/archive/corporate-marketing-2026-10-16/`). Borrow its shape (text values, source, owner, history, dependencies) but build new tables.

---

## 4. Data model

### 4.1 `event_public_figures`
One row per item.

| Column | Notes |
|---|---|
| `id` | |
| `event_id` | FK events, NOT NULL |
| `kind` | `figure` \| `breakdown` \| `outcome` |
| `catalogue_key` | nullable; from the catalogue (§5), e.g. `attendance`. NULL for custom items |
| `category` | catalogue category key (§5) or a custom category name |
| `group_label` | nullable; sub-programme the item belongs to, e.g. "Skillathon 2025", "FinTech World Cup". Items with the same group render together |
| `label` | the event's own wording, e.g. "Footfall", "Participants" |
| `working_payload` | JSONB, editable (shape by kind, §4.2) |
| `approved_payload` | JSONB, what tools read; NULL until approved |
| `approved_version` | int, increments on each approval |
| `status` | `draft` \| `in_internal_review` \| `pending_client` \| `client_suggested` \| `client_rejected` \| `approved` \| `edited_since_approval` |
| `source` | text, where the figure comes from: "Konfhub check-in export", "PR agency report (Mediaquest)", "Meta Business Suite" |
| `evidence_file_path` | nullable; storage path to the supporting file |
| `basis` | `measured` \| `estimate` (e.g. potential reach / page views are agency estimates). Shown to reviewers; consumers can choose to skip estimates |
| `owner_id` | staff member responsible |
| `notes` | internal notes, never shown on the client page |
| `sort_order`, `is_active` | `is_active=false` = removed from the public set (kept for audit) |
| `approved_by`, `approved_at`, timestamps | |

Unique on `(event_id, COALESCE(group_label,''), LOWER(label))`.

### 4.2 Payload shapes
- **figure:** `{ "display": "6,500+" }`. The label lives in the column, so the payload holds only the display value.
- **breakdown:** `{ "title": "Industry representation", "rows": [ { "label": "Education", "display": "20%", "percent": 20 }, … ] }`. `percent` is a number used for charts. Warn, don't block, when the percents don't add up to 100.
- **outcome:** `{ "text": "Karnataka State Skill Development Policy 2025–2032 launched by …" }`. Also used for competition winners, award winners and key announcements.

Approval covers the whole payload, so for a figure, the label and display value are approved together. Changing either one after approval sets `edited_since_approval`.

### 4.3 `event_public_figure_versions`
`figure_id, version, label, payload, approved_by, approved_at, approval_route ('internal'|'client'|'client_suggestion_accepted')`.

### 4.4 `event_public_figure_reviews` (one row per review round sent)
`id, event_id, audience ('internal'|'client'), review_token, item_ids UUID[], status ('open'|'closed'), sent_by, sent_at, closed_at, reviewer_name, reviewer_email`. Same token mechanism as `copy_library_bundles` / `app/public/copy-review/[token]`.

### 4.5 `event_public_figure_decisions`
`review_id, figure_id, decision ('approve'|'reject'|'suggest'), suggested_label, suggested_payload, comment, decided_at`. One row per item per round.

### 4.6 `event_public_figure_usages`
`figure_id, version, consumer_type, consumer_id, mode ('live'|'sent'), used_at`. Same live/sent meaning as `copy_library_usages`.

### 4.7 Audit
`event_public_figure_changes (figure_id, action, before, after, reason, changed_by, changed_at)`.

---

## 5. Catalogue and starter template

Define in code: `app/lib/content/public-figures-catalogue.ts`. Each entry: `key, category, kind, default_label, help` (what counts, typical source). The **starter template** is every catalogue entry below, created as `draft` items with **empty values**. It's built from the DFS 2025 and BSS 2025 reports combined.

"Start from template" creates the items. The producer removes what doesn't apply (bulk "remove all empty" is fine), fills values, renames labels and adds custom items or groups. It can only run when the event has no items yet. After that, "Add from catalogue" adds single entries.

| Category | Entries (kind = figure unless marked) |
|---|---|
| **At a glance** | `attendance` (Participants / Footfall), `speakers`, `government_leaders`, `ministers` (Ministers & governors / Ministerial representations), `regulators`, `investors`, `startups`, `exhibitors` (Exhibitors / Brands), `countries`, `ecosystem_partners`, `unicorns`, `exchange_ceos` (Stock exchange CEOs) |
| **Programme** | `content_hours`, `sessions`, `stages`, `themes` (Themes / Thematic tracks), `plenaries`, `roundtables`, `forums`, `dialogues`, `exhibition_arenas`, `side_events` (Ecosystem / side events), `programme_line` (outcome: "1 Anchor Plenary · 4 Thematic Tracks · 20 Sessions") |
| **Outcomes** | `mous` (MoUs & partnership announcements), `launches`, `key_announcement` (outcome, repeatable: policy launches, major announcements) |
| **Audience profile** | breakdowns: `audience_region`, `audience_industry`, `audience_role`, `audience_decision_authority`, `solutions_sought`, `exhibiting_nations`, `solutions_showcased` |
| **Investors** | `investor_aum`, breakdowns `investor_ticket_size`, `investor_type` |
| **Competitions & awards** (use `group_label` per programme) | `applications`, `finalists`, `winners`, `prize_value`, `winner_line` (outcome: winner and runners-up with institution), `award_categories`, `award_winners_line` (outcome) |
| **Media & PR** | `media_outreach`, `pr_value`, `media_reps`, `press_releases`, `articles`, `total_coverage`, `broadcast` (TV & radio), `interviews`, `circulation` (Circulation & potential page views; default `basis = estimate`) |
| **Digital & social** | `digital_reach` (Total reach), `impressions`, `views`, `interactions`, `accounts_reached`, `website_visits`; use `group_label` for per-channel figures ("LinkedIn", "Meta", "Google") |

The template is grouped and collapsible. Repeated groups (a second competition, per-channel digital) come from "Add group", which copies that category's entries under a new `group_label`.

---

## 6. Lifecycle

### 6.1 Edit
The producer fills values. Each save runs labels, outcome text and breakdown labels through `validateText` with the event's effective rules (errors block submission, warnings don't). That's how a spelling rule such as "Sharanprakash" is enforced on outcome lines. Breakdowns get the sum-to-100 warning.

### 6.2 Internal review
**Send for internal review** (anyone with `sae.forms.manage` on the event) creates a review round with `audience='internal'` and a token link that can go to colleagues, for example the PR team for media numbers. Alternatively, a user with `sae.forms.manage` can approve internally in the app per item or in bulk, which is faster when no outside input is needed.

### 6.3 Client review
When `events.copy_requires_client_approval` is true (reuse the Copy Library setting; one per-event switch for "client approves public content"), internally approved items go to the client. **Send for client approval** creates a round with `audience='client'` holding the selected items (default: all internally approved items not yet client-approved).

**Client page** (`app/public/figures-review/[token]`, styled like copy-review):
- Reviewer enters their name and email once.
- Items grouped by category and group, showing label, value, breakdown as a small table, outcome text and `basis` when it's an estimate. Source and notes are **not** shown.
- Per item: **Approve** · **Reject** (comment required) · **Suggest edit** (editable label + value, or rows for a breakdown, plus an optional comment).
- Also **Approve all remaining**, and **Submit** to close the round. Partial progress saves; the round closes on Submit.

### 6.4 Resolving a round (producer)
- **Approve** → item `approved` (`approval_route='client'`).
- **Suggest edit** → `client_suggested`. The producer sees the original next to the suggestion and either:
  - **Accept as suggested:** the payload becomes the suggestion exactly, and the item is `approved` (`approval_route='client_suggestion_accepted'`), **with no second round**.
  - **Counter:** the producer edits, the item goes to `in_internal_review` and joins the next client round.
- **Reject** → `client_rejected`. The producer either revises it (goes back into the next round) or removes it from the public set (`is_active=false`).

When `copy_requires_client_approval` is false, internal approval sets `approved` directly.

### 6.5 Reopen
Approved items are read-only. **Reopen** (`sae.forms.manage`, reason required) sets `edited_since_approval` and unlocks `working_payload`. Consumers keep reading `approved_payload` until the new version is approved. When it is approved:
- **live** consumers (website, YouTube descriptions, Copy Library items generated from figures) get an "Update available" alert, as with the Copy Library. YouTube descriptions auto-update once the pipeline exists.
- **sent** consumers (published report PDF, press releases issued) are only recorded.

---

## 7. Read API and consumers

`getPublicFigures(eventId, { categories?, keys?, groupLabel?, includeEstimates = true })` in `app/lib/content/public-figures.ts` returns approved, active items only: `{ id, catalogue_key, category, group_label, label, kind, payload, version, basis }`. Callers write a usage row.

**Wire in this build (only this):**
- **Copy Library `figures_block` (post variants).** When the event has approved public figures, post-phase `figures_block` generation is grounded on them instead of the messaging doc. The generator must use the figures exactly as approved, with no rewording of numbers, and record usages. With no approved figures, it behaves as today.

**Later builds** (each reads `getPublicFigures`, nothing else): post-event report generator, YouTube descriptions (video pipeline Phase 4), website post-event section, SAE thank-you posts, proposals and sponsor decks quoting "last edition" figures, Knowledge Base.

---

## 8. UI

**Event Details → new tab "Post-event"**, after Copy Library.

- **Header:** "Public figures: approved for use in public documents." Subline: "Internal actuals and targets are not kept here." That way nobody thinks this is where real numbers go.
- **Section 1: Public figures** (this build). Grouped by category, then `group_label`. Each item shows label, value or breakdown or outcome, status chip, basis badge (estimate), source, evidence link, owner, version, and the last decision with any client comment. Item actions: edit, remove, reopen.
  - Top bar: Start from template (only when empty) · Add from catalogue · Add custom item · Add group · Send for internal review · Approve internally · Send for client approval · counters (draft / in review / awaiting you / approved).
  - **"Awaiting you"** view: client-suggested and client-rejected items with original vs suggestion side by side and Accept as suggested / Counter / Remove.
- **Section 2: Post-event copy.** A read-only list of the event's Copy Library post-phase items with status, linking to the Copy Library tab. No second home for the copy.
- **Future:** internal actuals and targets get a **separate tab** ("Internal figures"), permission-gated. Not in this build.

---

## 9. Out of scope

Internal actuals and targets; analytics; testimonials; backfilling 2025 or earlier editions; pre-event public figures (they stay in the messaging doc / Copy Library `figures_block` pre for now); the report generator and other consumers beyond §7.

---

## 10. Step 0 (report before building)

Before writing code, report back to Madhu:
1. How `app/public/copy-review/[token]` and `app/api/public/copy-review/[token]` issue and check tokens, and how much can be shared with the new figures review page.
2. How Event Details tabs are registered (where Copy Library was added) and where "Post-event" will go.
3. Storage bucket and path convention to use for evidence files.
4. Whether `copy_requires_client_approval` exists as specified, and where the Copy Library `figures_block` generator gets its grounding today.
5. Any conflict with the pending Copy Library fixes.

---

### Step 0 outcome and decisions (13 Nov 2026)

- **Review page:** share only the token issue/lookup pattern and the page styling with copy-review. Per-item decisions get their own library, route and page (`app/public/figures-review/[token]`), as Step 0 found.
- **Event Details:** add "Post-event" to the hard-coded tab union, setTab and tab labels after Copy Library; render it from its own component (`app/components/post-event/PostEventTab.tsx`). Don't grow the event page further.
- **Evidence files: private DocuHub R2 bucket** (`DOCUHUB_R2_BUCKET`) via the existing DocuHub storage helper, path `public-figures/<event_id>/<figure_id>/<filename>`. Store the path only and serve downloads through short-lived signed URLs for users with access to the event. Never use the public SAE bucket. Don't list these files in DocuHub.
- **figures_block grounding: add a second source-reference kind** to Copy Library `source_refs`: `{ "type": "public_figure", "figure_id", "version" }` alongside the existing doc-section refs. When a public figure's new version is approved (§6.5), run the Copy Library review check for items referencing it: those items go to `needs_review` with a readable reason (e.g. "Footfall: '6,500+' → '6,800+'"), keep serving the last approved text, and offer Regenerate. Reason: one review mechanism for library items, whatever the source. A doc-section ref with no `type` is treated as `doc_section`, so existing rows need no migration.
- **Order:** build after the Copy Library fixes are merged; that fix set also touches `figures_block` (pre/post wording), so branch from main once they're in.

---

## 11. Acceptance (on a throwaway test event, never on a live or concluded event)

1. **Template:** "Start from template" creates every §5 entry as an empty draft; "remove all empty" leaves only filled items; Add group copies Competitions under "Test Hackathon".
2. **Validation:** an outcome line breaking an event rule shows the error and can't be submitted; a breakdown summing to 95 shows a warning and can be submitted.
3. **Internal approval:** bulk approve sets `approved` directly when `copy_requires_client_approval=false`.
4. **Client round:** with the setting true, send 5 items. On the token page: approve 2, reject 1 with a comment, suggest an edit on 2, Submit. Statuses update correctly; source and notes are not visible on the page.
5. **Accept exact suggestion:** the item becomes `approved` version 1 with route `client_suggestion_accepted`, and no new round.
6. **Counter:** the item joins the next client round; approving it there sets `approved`.
7. **Lock and reopen:** an approved item can't be edited; Reopen with a reason; `getPublicFigures` still returns the old version until the new one is approved; then returns version 2, and a live usage shows the update alert.
8. **Separation:** `getPublicFigures` never returns draft, in-review, removed or reopened-unapproved values.
9. **Copy Library:** with approved figures, post `figures_block` generation uses them exactly as approved and stores `public_figure` source refs; with none, generation is unchanged. Reopen and re-approve one referenced figure: the `figures_block` item flips to `needs_review` with a readable reason and still serves its last approved text; an item not referencing that figure stays approved.
10. **Regression:** DFS, FSF, FIFF, FTF, DFWS and BSS outputs unchanged (no items created for them).
11. **Audit:** every write above appears in `event_public_figure_changes`.

Report results to Madhu before pushing. Work on its own branch. Madhu runs migrations himself.
