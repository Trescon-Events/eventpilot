# Trescon profile: approved "About Trescon" boilerplate and company statistics

Date: 2026-10-15. Step 1 of "one approved source of Trescon facts that every tool reads". Agreed with Madhu.

## Why

1. **Boilerplate is written by the model today.** The press release generator asks Gemini for a `boilerplate` field (`app/api/events/press-releases/[id]/generate/route.ts`). Every release can carry different wording and different figures. This is the same failure as the SAE fixed lines: code should own fixed text, the model should not rewrite it.
2. **The source of truth already exists but is not wired to the tools.** The Corporate Marketing module (CM-001 deck, CM-002.1 statistics) already has:
   - `corporate_company_content` with a `boilerplate` key (written when a deck mapping is confirmed);
   - `cm_statistics` with a draft, pending_review, approved workflow, plus `cm_statistic_dependencies` that flip to `needs_review` when a statistic changes;
   - deck upload and Gemini section analysis (`app/lib/corporate-marketing/analyse-deck.ts`).
   Nothing outside the deck module reads any of it. **Do not build a new profile page or new tables.** Reuse these.
3. Madhu approved new boilerplate wording on 15 Oct 2026: three lengths (short, standard, long) plus a Signature Events module and a Managed Events module.

## Non-negotiables

1. **No change to DFS, FSF, FIFF, FTF, DFWS or BSS output.** Managed events (`events.type = 'managed'`) keep today's press release behaviour exactly. The Trescon boilerplate applies to Trescon-owned events only, using the existing `tresconDocsReach` / `getTresconOwnedEventIds` logic in `app/lib/content/trescon-layer.ts`.
2. **Consumers read only the approved text** (`approved_text`), never the working copy. If nothing is approved yet, behaviour is unchanged and the user sees a warning. No silent fallback to model-written text without telling the producer.
3. **Do not touch the deck upload, analysis or mapping flow.** Marketing owns it. Confirming a `boilerplate` mapping may still overwrite the working copy (`value_text`); that must never change `approved_text`.
4. **Only a super admin approves** (`session.adm`), which today means Madhu. Corporate Marketing access holders can edit the working copy as they can now.
5. **No new tables.** One migration, already written: `supabase/trescon_profile_boilerplate_migration.sql`. Review it, do not rewrite the approved wording.

## Part 1: the migration (already written, review only)

`supabase/trescon_profile_boilerplate_migration.sql`:
- adds `approved_text`, `approved_by`, `approved_at` to `corporate_company_content`;
- seeds five keys into `value_text` only if empty: `boilerplate` (standard), `boilerplate_short`, `boilerplate_long`, `boilerplate_signature_module`, `boilerplate_managed_module`;
- seeds ten company statistics as `pending_review` (never `approved`): Founded 2016, Events Delivered 500+, Attendees 500,000+, Countries 120+, Employees 250+, Government Partners 50+, Association and Media Partners 500+, Investors Engaged 3,500+, Speakers Featured 3,000+, Exhibitors Showcased 5,000+. Only empty existing rows are filled;
- links the boilerplate to those statistics in `cm_statistic_dependencies` (`module = 'content'`), so a later statistic change flags the boilerplate for review through the existing trigger.

Before handing it to Madhu, check it against the real tables: column names, the `ON CONFLICT` target on `cm_statistic_dependencies`, and that the Statistics dependency screens cope with an unfamiliar `module` value (`'content'`). Fix anything that would fail, and tell Madhu what you changed. Madhu runs it in the EventPilot Supabase SQL editor.

## Part 2: approve action and house-rules check

In `app/api/corporate-marketing/content/route.ts`, add an approve action beside the existing PATCH:
- body `{ key, action: 'approve' }`, super admin only, otherwise 403;
- run the working copy through the Trescon-wide rules before approving: `resolveEffectiveRulesForOwner` with the Trescon-wide (`org`) owner from `app/lib/content/owner.ts`, then `validateText`. **Errors block the approval and are returned. Warnings are returned and do not block.**
- on success copy `value_text` to `approved_text`, set `approved_by` and `approved_at`;
- GET returns `approved_text`, `approved_at` and a derived state per key: `approved`, `edited_since_approval`, or `not_approved`.

Only the boilerplate keys need approval. Leave overview, vision, mission and tagline unchanged.

## Part 3: UI

In `app/admin/toolkit/corporate-marketing/deck/DynamicContentTab.tsx`:
- add the four new keys to `PROSE_KEYS` and `PROSE_LABELS` ("Boilerplate: short", "Boilerplate: long", and the two modules);
- show a state chip on each boilerplate key (Approved date, Edited since approval, Not approved);
- show an Approve button to super admins only, with any rule findings listed under it;
- keep autosave-on-blur for the working copy as it is.

## Part 4: helper and first consumer

New `app/lib/content/trescon-profile.ts`:
- `getApprovedText(key)` returns `approved_text` or null;
- `getAboutTresconForEvent(eventId)` returns `{ text, kind }` for a Trescon-owned event (the approved `boilerplate`, plus `boilerplate_signature_module` appended when the event is a Trescon Signature Event), and `null` for a managed event or when nothing is approved.

First consumer, the press release generator:
- for a Trescon-owned event with approved text, the **code** sets `boilerplate` to the approved text. Remove the boilerplate request from the model prompt for these events so the model does not write a second one;
- for a managed event, or when nothing is approved, keep today's behaviour exactly, and when nothing is approved on a Trescon-owned event return a `boilerplate_warning` the press release page shows;
- in `apply-edit`, the `boilerplate` field stays user-editable (it can be a deliberate override), but a regenerate must not undo an inserted approved boilerplate silently. Check what regenerate does to it and report.

Do not wire any other tool in this change. The helper is the hook for the website builder, proposals and Pilot AI later.

## Checks before push

1. Run the migration on a copy or read it line by line, and confirm it changes nothing for the existing non-empty rows.
2. Approve the standard boilerplate as a super admin: it passes the Trescon-wide rules. Then paste a test version containing an em dash and confirm approval is blocked with the finding.
3. As a non-admin Corporate Marketing user, confirm Approve is not shown and the API returns 403.
4. Press release on a Trescon-owned test event: the stored `boilerplate` equals the approved text word for word.
5. Press release on a managed event (use DFS or BSS read-only, or a managed test event): output and prompt are unchanged.
6. Edit the working copy after approval: the chip shows Edited since approval, and a new press release still uses the approved text.
7. Change a seeded statistic: the boilerplate dependency flips to `needs_review` in the Statistics impact view.

Report results to Madhu before pushing. Do not change any reference document or pack on the six live events.

## Later (not in this change)

Deck upload already extracts section text and maps slides. What it does not do is compare extracted statistics with the approved values and flag conflicts (this deck had three). That comparison belongs in the shared "upload, extract, review, approve" pipeline planned for event project briefs, and can reuse the deck analysis result.
