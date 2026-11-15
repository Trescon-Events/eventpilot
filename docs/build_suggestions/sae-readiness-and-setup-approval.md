# SAE: readiness check, setup approval, assembled by default

Date: 2026-10-14. Phase 0 of the content-setup hardening plan (retrospective doc, 14 Oct). Agreed with Madhu.
Scope: Stakeholder Announcement Engine (SAE) generation only. Press Release Studio and other consumers come later.

## Why

Every SAE failure seen on live events in Sept–Oct was a setup problem that produced plausible-looking but wrong posts:
- DFWS: `event_hashtag` and `registration_url` were NULL. Posts had no event hashtag, and one had a CTA with no link.
- FIFF: the hashtag held a lower-case L in place of a capital I, and the name had a trailing non-breaking space.
- WAIS Malaysia: `public_name` reads "World Al Show - Malaysia" (lower-case L), while `name` reads "World AI Show Malaysia 2026".
- Every event started in legacy mode and had to be switched to assembled mode by SQL.

Today nothing stops generation when setup is incomplete or dirty, and fixing it needs SQL. After this build:
- EventPilot refuses to generate until setup is complete and clean.
- Madhu approves each new event's setup once, on one screen.
- No routine setup step needs SQL.

## Non-negotiables

1. **The six live events must keep generating without interruption.** These are DFS, FSF, FIFF, FTF, DFWS and BSS, under the "grandfathered" rule below. Producers rely on them now. Madhu: no changes to DFFW or BSS documents or packs until those events are over.
2. **Legacy-mode behaviour is unchanged** for DFS.
3. **Never auto-fix content silently**, except the whitespace and invisible-character clean-up in Part 1, which is lossless.
4. **Approval is admin-only for now.** Madhu is the only approver.

## Part 1: clean text on save

Wherever these event fields are written (Event Details save, Staff Portal sync, any PATCH route), normalise them before storing: `name`, `public_name`, `public_dates_display`, `public_venue_display`, `event_hashtag`, `registration_url`, `announcement_cta_label`, `announcement_attribution_line`.
- Replace U+00A0 (non-breaking space) and other Unicode space separators with a normal space.
- Remove zero-width characters (U+200B–U+200D, U+2060, U+FEFF) and soft hyphens (U+00AD).
- Collapse repeated spaces and trim both ends.

Put this in one shared helper, for example `app/lib/text/clean-field.ts`, with unit tests. Do not touch letters. Lookalike letters (l for I) are flagged by Part 2, never auto-changed.

## Part 2: readiness check

Add a pure function, for example `app/lib/events/sae-readiness.ts`. It takes the event row, its umbrella, the live documents (event and umbrella), the latest compiled reference and the effective rules. It returns a list of checks of the form `{ key, level: 'block' | 'warn', message, fix_href }`.

**Blocking checks (`level: 'block'`)**

| Key | Passes when |
|---|---|
| `public_name` | Set |
| `dates` | `public_dates_display` set |
| `venue` | `public_venue_display` set |
| `hashtag` | `event_hashtag` set, starts with `#`, and contains only A–Z, a–z and 0–9 after the `#` |
| `cta` | `registration_url` is set and starts with `https://`, and `announcement_cta_label` is set |
| `messaging_doc` | At least one live `messaging` document (event or umbrella), and a compiled reference exists |
| `clean_text` | None of the fields in Part 1 still hold invisible characters or leading or trailing spaces, for rows written before Part 1 shipped |

**Warnings (`level: 'warn'`)**

| Key | Fires when |
|---|---|
| `hashtag_vs_name` | The hashtag, lower-cased with `#` and digits removed, does not equal `public_name` lower-cased with spaces, punctuation and the year removed. This catches the FIFF lower-case-L case. |
| `public_vs_internal_name` | `public_name` and `name` differ by any word other than the year, punctuation or a spelling variant ending in -isation/-ization. This catches "World Al Show". |
| `copy_mode` | `sae_copy_mode` is legacy |
| `attribution` | The event is under an umbrella and `announcement_attribution_line` is empty. Warning only: DFS deliberately has none. |
| `pending_drafts` | Any reference document for the event or its umbrella is still in draft or extracting |
| `compile_failed` | The last recompile errored. Surface the error; today it is swallowed. |
| `conflicts` | The compiled reference has unresolved conflicts. Show the count. |

**Per-speaker warnings** (shown on the generate screen, never blocking):
- missing title or company;
- an en or em dash in the company name (it breaks the KonfHub push);
- a short bio over 500 characters;
- a missing public name or pronoun style.

## Part 3: setup approval

**Columns on `events`:** `sae_setup_approved_at` (timestamptz), `sae_setup_approved_by` (staff id), `sae_setup_fingerprint` (text) and `sae_setup_enforce` (boolean, default `true`).

**Fingerprint** is a hash of everything that shapes the output:
- the fixed-line fields;
- `sae_copy_mode` and `announcement_line_emojis`;
- the ids and versions of live reference documents, for the event and its umbrella;
- the ids and `updated_at` values of the effective validation rules.

**Gate.** In `announcements/generate`, `regenerate-copy` and the headline and short-bio generators, refuse with a 409 and a readable reason when any of these holds:
- any blocking check fails;
- `sae_setup_enforce` is true and the event is not approved;
- `sae_setup_enforce` is true and the fingerprint no longer matches the approved one.

**Grandfathered events.** In the migration, set `sae_setup_enforce = false` and record approval (now, by Madhu, current fingerprint) for DFS, FSF, FIFF, FTF, DFWS and BSS. For these six:
- blocking checks still apply (they all pass today);
- a changed fingerprint shows an amber "setup changed since approval" banner instead of locking generation.

Every other existing event, and every new one, enforces.

**Approval screen.** Add it as a new "Setup" tab in Event Details (`/admin/events/[id]/details?tab=setup`). It shows:
1. the readiness checklist, each item linking to where it is fixed;
2. the fixed lines exactly as they will print, built with the real `buildDateVenueLine`, `buildAttributionLine` and `buildFixedCtaLine` and the hashtag line;
3. the source documents: role, rank, provenance, version, who uploaded them and when, plus the compiled-reference version and conflict count;
4. the active rules, grouped by owner (umbrella or event), with severity and source clause;
5. a **Generate 3 samples** button that runs `generateAnnouncementCopy` for three confirmed speakers and shows the copy and findings without inserting `stakeholder_announcements` rows;
6. an **Approve setup** button, platform admins only (new permission `sae.setup.approve`, granted to nobody else).

**Editing without SQL.** Add three inputs to the Event Details form beside the existing public fields: CTA label, attribution line and copy mode (legacy or assembled). Today these can only be set by SQL.

## Part 4: assembled by default

- `ALTER TABLE events ALTER COLUMN sae_copy_mode SET DEFAULT 'assembled'`. Check that the Staff Portal sync does not write `sae_copy_mode` on insert. Leave existing rows alone.
- Do not remove the legacy path. DFS uses it until its event is over.

## Checks before push

1. **DFWS replay.** On a copy of DFWS's settings with `event_hashtag` and `registration_url` NULL, generation is refused with both reasons listed.
2. **Hashtag lookalike.** A test event with hashtag `#Futurelslamic…` (lower-case L) shows the `hashtag_vs_name` warning.
3. **Invisible characters.** Saving a name with a trailing U+00A0 stores it without one, and the stored name has 33 characters for "Future Islamic Finance Forum 2026".
4. **WAIS Malaysia name.** WAIS Malaysia shows the `public_vs_internal_name` warning.
5. **New event.** A new test event is assembled by default and locked until approved. Approve it, and generation works. Upload a new messaging version, and it is locked again.
6. **Grandfathered events.** DFS, FSF, FIFF, FTF, DFWS and BSS each generate one post exactly as before, with no lock. Uploading a document to one shows the amber banner, not a lock. Delete the test uploads and posts afterwards.
7. **Samples screen.** Generate 3 samples leaves no rows in `stakeholder_announcements`.

Report results to Madhu. Do not change any reference document or rule on the six live events.
