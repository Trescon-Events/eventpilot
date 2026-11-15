# Copy Library: approved, reusable copy for every tool

**Date:** 6 Nov 2026. Discussed and agreed with Madhu (3–6 Nov). Proposed build.
**Depends on:** `doc-rule-linkage-and-canonical-names.md` being merged first (this build reuses its `edit-diff.ts`).
**Builds on:** `rules-screen-and-trescon-layer.md` (owner levels, Rules screen), `trescon-profile-boilerplate.md` (approved-text pattern), `sae-readiness-and-setup-approval.md` (readiness checks, fingerprints), `sae-attribution-line.md`.

---

## 1. Why

Every tool writes its own version of the same text: "about the event" in press releases, invites and SAE; organiser lines; CTAs; soon YouTube descriptions. Versions drift, and a correction (for example the BSS Minister's spelling, 30 Oct) has to be chased through every tool by hand.

The Copy Library is one place per event where Trescon-written, approved copy lives. Tools never write their own version of a library item; they read the approved one. Change it once, and every consumer knows.

**Division of responsibility (agreed):**

| Home | Holds | Approved by |
|---|---|---|
| Messaging doc | What the event is: positioning, facts, figures, client restrictions, protocol, client-verbatim quotes and descriptors | Client |
| Common Details | Atomic facts tools insert verbatim: name, dates, venue, links, event hashtag | Producer (from doc) |
| Rules screen | Checkable rules, plus a new **Style notes** section for non-checkable writing guidance and event-level style overrides | Producer / admin |
| **Copy Library (new)** | Ready-to-use Trescon-written copy built from the above | Producer, then client as one bundle |
| Tools | Read library items by key; never author them | n/a |

Messaging docs carry **no** ready-made copy from now on. Slimming existing docs is out of scope (see §9).

---

## 2. Non-negotiables

1. **No change to output on DFS, FSF, FIFF, FTF, DFWS or BSS** unless that event has approved library items AND the consumer has been switched to read them (§6). Every consumer falls back to today's source when no approved item exists, and that fallback must be byte-identical to current behaviour.
2. **Tools only ever read `approved_text`.** A working copy, a draft, or an item in review is never used.
3. **Review never blocks a tool.** While an item is in `needs_review`, consumers keep using the last approved version.
4. **House-style changes do not trigger reviews** (Madhu, 6 Nov). Only changes to the event's (or its umbrella's) messaging doc do. House-style changes apply to newly generated or newly edited items only.
5. **No escalation** for overdue reviews (Madhu, 6 Nov). Show status; do not notify up the chain.
6. **Do not duplicate the Trescon boilerplate.** "About Trescon" stays in `corporate_company_content` (`trescon-profile-boilerplate.md`). The Copy Library shows it read-only at the Trescon-wide level and links to it.
7. **Every write is audited** (who, when, before, after), same as `validation_rule_changes`.

---

## 3. Data model

Reuse the owner model from the Rules screen (`ContentOwnerRef`: event | umbrella | org).

### `copy_library_items`
One row per item variant.

| Column | Notes |
|---|---|
| `id` | |
| `event_id` / `umbrella_id` / `org_scope` | exactly one set, same CHECK and partial-unique-index pattern as `event_validation_rules` |
| `asset_key` | from the catalogue (§4), e.g. `about_event` |
| `variant_length` | `one_liner` \| `short` \| `medium` \| `long` \| `x` \| `n/a` |
| `variant_phase` | `pre` \| `post` \| `any` |
| `working_text` | editable draft |
| `approved_text` | what tools read; NULL until approved |
| `approved_version` | integer, increments on each approval |
| `status` | `draft` \| `in_internal_review` \| `pending_client` \| `approved` \| `needs_review` \| `edited_since_approval` |
| `source` | `generated` \| `manual` \| `from_doc` (read-only mirror of client-verbatim text, §4) |
| `source_refs` | JSONB: `[{ doc_id, section_id, section_hash }]` the item was built from |
| `approved_by`, `approved_at`, `client_bundle_id` | |
| `review_reason` | why it is in `needs_review` (e.g. "Leadership reference changed: 'Sharanaprakash' → 'Sharanprakash'") |

Unique on `(owner, asset_key, variant_length, variant_phase)`.

### `copy_library_versions`
Every approved version kept: `item_id, version, text, approved_by, approved_at`. Consumers pin to a version.

### `copy_library_usages`
`item_id, version, consumer_type, consumer_id, mode ('live'|'sent'), used_at`. Written by every consumer when it uses an item (§6).

### `copy_library_bundles`
Client approval bundles: `id, owner, item_ids[], status (sent|approved|changes_requested), review_token, sent_at, decided_at, client_comment`. Mirror the existing public announcement-review link pattern (`app/public/announcement-review`) for the client-facing page: token link, read-only list of items, Approve all / Request changes with a comment.

### `events.content_phase`
`TEXT NOT NULL DEFAULT 'pre' CHECK (content_phase IN ('pre','post'))`. Manual switch on Event Details ("Event concluded: switch copy to post-event"). **Do not derive it from `event_date`/`end_date`**: those are the Staff Portal staff-allocation window, not the event's dates (Madhu, 13 Aug). Show a suggestion banner when `public_dates_display` appears to be in the past, but the producer flips it.

Consumers pick `variant_phase = content_phase`, falling back to `any`.

---

## 4. Catalogue (starter set)

Define the catalogue in code (`app/lib/content/copy-catalogue.ts`): key, label, allowed variants, owner levels allowed, generation guidance, and which consumers read it. Starter set:

| asset_key | Variants | Notes |
|---|---|---|
| `about_event` | one_liner, short (~50 words), medium (~100), long (~250); each pre + post | Pre: "will bring together…". Post: "brought together…". |
| `organiser_line` | full, short (use `variant_length` long/short) | e.g. BSS full form with SDEL, KSDC, KSDA, KDEM, "Managed by Trescon". |
| `attribution_line` | n/a, any | Replaces `events.announcement_attribution_line` as the source (§6). |
| `cta` | n/a; pre (register / request invitation) + post (watch sessions / next edition) | Text + URL. Replaces `announcement_cta_label` as the source (§6). |
| `figures_block` | short, long; pre + post | Only figures from the doc's facts sections; tense by phase. |
| `programme_highlights` | short | One line per signature programme element, from the doc. |
| `press_release_ending` | n/a, any | Managed events: About the event + managed-by line + media contact. Trescon-owned events: About the event + link to the approved Trescon boilerplate (do not copy its text). |
| `youtube_footer` | n/a, post | Agreed structure (5 Nov): About, organiser line, watch-all-sessions link, website, socials, subscribe, three approved hashtags. Placeholders `{playlist_link}`, `{website}` filled at use. |
| `social_signoff` | n/a, any | Hashtag set + handles. |
| `konfhub_description` | long, pre | Ticketing / event-app description. |
| `recap` | medium, post | Post-event recap paragraph. |
| `approved_quotes` | n/a, any | `source = from_doc`: read-only mirror of the doc's client-verbatim quotes with exact attribution. Not editable in the library. |

Trescon-wide level: `about_trescon` shown read-only, linked to `corporate_company_content` (§2.6).

---

## 5. Lifecycle

### Generate
"Generate starter set" on the Copy Library tab. One Gemini call per item (or a batched call), grounded in:
- the compiled reference (messaging doc, umbrella doc),
- Common Details,
- the effective Style notes and rules,
- the catalogue guidance for the item.

Every generated `working_text` is run through `validateText` with the event's effective rules. Errors are shown inline and block submission; warnings are shown and do not block. Store `source_refs` with the section ids and a hash of each section used.

`from_doc` items are copied verbatim from their doc sections, not generated.

### Edit and internal approval
Producer edits `working_text` (autosave). **Approve internally** = `sae.forms.manage` on the event (same permission as event rules). Org-level items: platform admins only.

### Client approval (bundled)
"Send for client approval" bundles all items currently in `in_internal_review`, creates a `copy_library_bundles` row and a token link (same mechanism as announcement review). Client approves all or requests changes with one comment. On approval every item in the bundle becomes `approved` (copy to `approved_text`, bump `approved_version`, write a `copy_library_versions` row).

Per-event setting: `events.copy_requires_client_approval BOOLEAN DEFAULT true for managed events, false otherwise`. When false, internal approval sets `approved` directly.

### Review cycle (messaging doc changes)
Trigger: a new live messaging-doc version, or a live-doc section edit (apply-edit), for the event or its umbrella.
1. For each library item, compare its `source_refs[].section_hash` with the current section content.
2. Changed → `status = needs_review`, `review_reason` from `changedPhrases()` (`edit-diff.ts`), e.g. "Leadership reference: 'Sharanaprakash' → 'Sharanprakash'". Offer a one-click **"Apply this change"** that runs the same replacement on `working_text`, plus **"Regenerate"**.
3. Assign to the event's producer: badge on the Copy Library tab and on the event workspace. No escalation.
4. Re-approval follows the normal path; client re-approval bundles only the changed items.
5. Consumers keep using the last `approved_text` meanwhile.

House-style or Trescon-wide rule changes do **not** run this cycle (§2.4).

### Editing after approval
Editing an approved item's `working_text` sets `edited_since_approval`. Tools still read `approved_text` until it is re-approved.

---

## 6. Consumers

### Read API
`getCopyItem(eventId, assetKey, { length?, phase? })` in `app/lib/content/copy-library.ts`: resolves event → umbrella → org (most specific wins), picks `variant_phase = events.content_phase` then `any`, returns `{ text, item_id, version }` or `null`. Callers record a `copy_library_usages` row.

### Consumer modes
- **live** (can be updated after use): SAE templates, Konfhub description, website, YouTube descriptions. When a newer approved version exists than the one used, show an alert on that consumer with **Update now**. For **YouTube descriptions, update automatically** (Madhu, 5 Nov) once the YouTube pipeline exists; record the update in usages.
- **sent** (immutable once out): press releases issued, emails sent. Record the version used; no alert.

### Wire in this build (only these)
1. **SAE fixed lines.** In `assembleOrgPromoCopy` and the readiness check, read `cta` and `attribution_line` from the library first; fall back to `events.announcement_cta_label` / `announcement_attribution_line` when no approved item exists. **Acceptance: for every live event with no approved library items, SAE output is byte-identical.** Do not drop the columns.
2. **Readiness check.** Add a warning (not a block) `copy_library_incomplete` listing starter-set items with no approved version.

Everything else (press releases, invites, Konfhub, website, YouTube) consumes the library in its own later build. `youtube_footer` is created and approved now so the video pipeline can use it.

---

## 7. Style notes in the Rules screen

Agreed 6 Nov: event-level style overrides live in the Rules screen, not the messaging doc.

- New table `style_notes (id, owner columns as rules, note TEXT, category TEXT, origin client|trescon, is_active, created_by, created_at)` with the same audit table pattern.
- Rules screen gets a **Style notes** section per level (Trescon-wide, umbrella, event), add/edit/switch off, same permissions as rules.
- Generators (SAE, short bio, headlines, Copy Library generation, press release) add the effective style notes to their prompt context, below client documents in authority.
- **Do not migrate** existing writing standards out of the BSS or DFFW docs (§9). New events put their overrides here.

Examples of what belongs here for BSS-like events: "Oxford comma", "Rupees as ₹ with lakh or crore", "Keep full stops in honorifics", "After first mention, refer to ministers by office: 'Hon'ble Minister'", "'Flagship', 'landmark', 'premier' are permitted".

---

## 8. UI

**Event Details → new tab "Copy Library"**, next to Reference Docs.
- Grouped by catalogue section (Identity, Attribution, Proof, Calls to action, Channel blocks, Post-event).
- Each item: variants as tabs (length × phase), status chip, approved version + date, working-copy editor, validation findings, source sections ("Built from: Introduction, Positioning"), usage count ("Used by 12 SAE posts, 1 press release").
- Inherited items (umbrella, Trescon-wide) shown read-only with their level label.
- Top bar: Generate starter set · Send for client approval · phase switch (pre/post) · count of items needing review.

**Trescon house style page:** Trescon-wide items and style notes.

---

## 9. Concluded events (agreed 5 Nov)

BSS, FSF, FIFF, FTF, DFS and DFWS concluded around 5 Nov. **Do not modify their messaging docs or rules.** After this build, generate their Copy Libraries from their current docs, focusing on post-event items (`about_event` post, `recap`, `youtube_footer`, `figures_block` post), and switch `content_phase` to `post` when Madhu confirms. That is a producer action in the UI, not a migration.

---

## 10. Acceptance

1. **Regression:** for DFS, FSF, FIFF, FTF, DFWS and BSS, generate one SAE announcement before and after (no library items approved): identical structure, CTA, attribution, dates and title format.
2. **Generate on BSS:** starter set generates; every item passes the BSS error-level rules or shows the findings; `approved_quotes` is a verbatim, read-only copy of the doc's quote with "Dr. Sharanprakash Rudrappa Patil" attribution.
3. **Bundle:** send the BSS starter set for client approval; the token page lists every item; Approve all sets each to `approved` with version 1.
4. **SAE consumes:** with BSS `cta` approved and changed to a test wording, a new BSS announcement uses the library text; switch back.
5. **Review cycle:** edit the BSS Leadership reference section (test change); every item built from it flips to `needs_review` with a readable reason and an Apply-this-change option; untouched items stay approved; SAE keeps using the last approved text. Revert the test change.
6. **House style:** add a Trescon-wide test rule; no item changes status. Delete the test rule.
7. **Phase:** switch BSS to `post`; `getCopyItem(bss,'about_event',{length:'short'})` returns the post variant; switch back.
8. **Inheritance:** an umbrella-level item shows on a child event as inherited; an event-level item with the same key overrides it.
9. **Audit:** every write above appears in the audit table.

Report results to Madhu before pushing.

---

## 11. Decisions (confirmed by Madhu, 6 Nov 2026)

- Starter set as in §4 (12 keys).
- `content_phase` is a manual switch with a suggestion banner (§3), not automatic.
- Internal approval by anyone with `sae.forms.manage` on the event; client approval required by default for managed events only (`copy_requires_client_approval`).
