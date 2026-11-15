# SAE: stop every post in a batch opening the same way

Date: 2026-10-14. Applies to 'assembled' mode, org_promo (speaker and partner). Do not change legacy mode.

## Problem

Each announcement is generated on its own, so the model cannot see earlier posts. For DFWS, all four test posts opened "Navigating the complexities of ..." and hook similarity reached 0.75. The same will happen on any event whose messaging is tight. Prompt wording alone cannot fix this, because the model never sees the other posts.

## Design (code-owned, no quoting of banned phrases)

Two parts. Do both.

### Part 1: rotate the opening style (prevents most repeats)

In `app/api/events/stakeholders/announcements/generate/route.ts` and `regenerate-copy/route.ts`:
1. Count existing `stakeholder_announcements` rows for this event with `announcement_kind = 'org_promo'` (for regenerate, exclude the row being regenerated).
2. Pass `openerStyleIndex = count % 4` into `generateAnnouncementCopy(...)` and on to `generatePostCopyDraft(...)`.

In `generatePostCopyDraft`, replace the hook line (item 1 in the prompt) with one that adds a style instruction chosen by `openerStyleIndex`:
- 0: open with a direct question about the speaker's or partner's topic.
- 1: open with one concrete observation drawn from the speaker's talking points or bio.
- 2: open with a short trend statement tied to the event's themes.
- 3: open with the topic itself as a plain noun phrase, then a verb (for example "Succession planning is moving ...").

Write the instructions as positive directions only. Do not include example sentences, because worked examples get lifted verbatim.

### Part 2: duplicate-opener check with the existing retry (catches the rest)

In the same two routes, fetch the hooks of the last 10 org_promo announcements for the event (first paragraph of `post_copy`) and pass them as `recentHooks: string[]`.

In `generateAndValidateOrgPromoCopy`, after `draft1`:
- Take the first 3 words of `draft1.hook`, lower-cased, punctuation stripped.
- If they match the first 3 words of any `recentHooks` entry, treat it as needing a retry even when there are no error findings.
- Call `generatePostCopyDraft` once more with a retryAddendum: "The opening of your hook matches an earlier post for this event. Rewrite the hook so it starts differently and uses a different sentence shape. Keep every other field as it was."
- Do not print the earlier hooks in the addendum. Keep it positive and generic.
- Use the second draft whatever it returns (never block). Set `attempts` to 2 if a retry ran.
- Do not run a second retry if the findings retry has already used the one allowed. In that case keep the findings retry result.

## Checks after building

1. Generate 4 DFWS speaker posts in a row. No two hooks may share the same first 3 words, and no two openings may share a shape.
2. Generate on FSF, FIFF and FTF. The pack-required opening shape and all fixed lines must be unchanged.
3. Legacy events (for example DFS) must produce copy exactly as before.
4. `validation_attempts` is 2 only when a retry ran.

## Also check while in there (DFWS)

An earlier DFWS test post opened "We are pleased to confirm that". That is the announce-opener family the production pack already tells the model to avoid. If it recurs after this build, add a forbidden_pattern rule at the DFFW umbrella (rank 1) covering "pleased to confirm", "thrilled to", "excited to announce", "pleased to announce". Do not build that rule now. Only add it if it recurs.
