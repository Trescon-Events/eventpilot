# SAE: deterministic fixed lines, validate-and-retry, graceful X copy

**Status:** proposed build. Raised 28 Sep 2026 from the first Bengaluru Skill Summit (BSS) test runs.
**Place in repo:** `docs/build_suggestions/sae-deterministic-copy-spec.md`
**Supersedes:** section 4 ("X copy truncated") of `speaker-own-facts-and-indian-honorifics.md`. Sections 1–3 of that note (facts-only scope, Hon'ble option, `normalizeTitle`) are included here as Stage 5 so the whole fix ships as one build.
**Applies to:** every event, not just BSS. Every change reads from the event's own details and rules.

---

## 1. Why

Two live BSS test generations for the same speaker (Subroto Bagchi) failed in ways that will repeat on every speaker, every event:

| Defect seen | Cause |
|---|---|
| Date written "3-5 November 2026" (hyphen) although event details say "3–5 November 2026" | Model rewrites the date line despite "reuse verbatim" |
| 🗓️ used instead of the approved 📅 | Model chooses the emoji |
| "Chairman at Vision Group …, Government of Karnataka, India" | Prompt feeds `role at company, country`; model copies the shape |
| X copy cut mid-hashtag ("#BengaluruSkillS…") | Model returns >280 chars; `clampToX()` slices at 279 |
| X copy uses "&" and "US $1B" although the rules forbid them | X copy gets the rules only indirectly; no post-generation correction |
| Minister/official referred to as "he" | No Indian honorific in `pronoun_style` |

The deterministic validator (Stage 3 of the reference-documents build) now catches most of these, but only **after** the draft exists, so a human fixes every draft by hand. The goal of this build: drafts reach the reviewer already clean.

**Principle:** anything that is the same on every post (dates, venue, CTA, event hashtag, speaker title line) is assembled in code from event and speaker data. The model writes only the variable prose. Anything the validator flags as an error triggers one automatic rewrite before a human sees it.

---

## 2. Current state (verified 27–28 Sep 2026)

- `app/lib/events/announcements.ts`
  - `generatePostCopy()` asks the model for all five paragraphs (hook, announcement, credibility, date/venue line, CTA) plus `hashtags[]` and `x_copy`.
  - `stakeholderContext` feeds `Speaker: <name>, <role> at <company>, <country>`.
  - `parseGeminiCopyResponse()` joins `copy` + hashtag line; `clampToX()` hard-slices X copy to 279 + "…".
  - `generateSelfPromoPostCopy()` and `generateHeadlines()` share the same `messagingContext` wording.
- `app/api/events/stakeholders/announcements/generate/route.ts` runs `validateText()` on `post_copy` and `post_copy_x` **after** generation and stores `validation_findings`. Never regenerates.
- `regenerate-copy` route reuses `generatePostCopy()`; in the BSS test a LinkedIn regenerate left `post_copy_x` byte-identical to the previous draft. Check whether regenerate-copy is meant to refresh both fields; if not, that is a separate bug to fix here.
- `events` already carries `public_dates_display`, `public_venue_display`, `event_hashtag`, `registration_url` (set from the approved messaging doc's `default_fields`).
- `app/lib/content/validate.ts` + `resolve-validation-rules.ts`: pure, synchronous, reusable here.

---

## 3. What to build

### Stage 1 — Fixed lines assembled in code (org-promo LinkedIn copy)

Change the model contract from five paragraphs to three:

```json
{ "hook": "...", "announcement": "...", "credibility": "...", "hashtags": ["#...", "..."], "x_body": "..." }
```

Then assemble in code:

```
<hook>

<announcement>

<credibility>

<date/venue line>

<CTA line>

<hashtag line>
```

- **Date/venue line:** `public_dates_display` and `public_venue_display` inserted verbatim, never passed through the model.
  - New event setting `announcement_line_emojis` (BOOLEAN, default `false`). When true: `📅 <dates> | 📍 <venue>`. When false: `<dates> | <venue>`.
  - **Default false preserves current behaviour for DFS and every other event.** Set true for BSS.
- **CTA line:** `Register here: <registration_url>`. Make the label an event setting `announcement_cta_label` (TEXT, default `'Register here:'`) so events with a different approved CTA (DFS uses "View passes and register") can set theirs.
- If `public_dates_display`, `public_venue_display` or `registration_url` is empty, omit that line (current behaviour), never invent.
- Keep the prompt's paragraph guidance for hook/announcement/credibility; remove the instructions for paragraphs 4 and 5.

### Stage 2 — Speaker line built in code

- Build a `speakerLine` string in code and pass it to the model with the instruction **"use this exact wording when naming the speaker"**:
  - `<public_name or name>, <role>, <company>` (comma-separated, no "at").
  - Omit `company` when empty (fixes "Sculptor Artist at" for a speaker with no company).
  - **Country:** omit when the speaker's country equals the event's country; include otherwise. Verify whether `events` has a country column; if not, add `events.country` (TEXT, nullable). When null, omit country for every speaker. **DECISION (default assumed): foreign speakers only.**
- Stop passing `country` as a separate trailing field in `stakeholderContext`.
- Leave the creative's `country` text layer untouched; that is a design choice per template.

### Stage 3 — Hashtags: event hashtag guaranteed, the rest filtered

- Code always places `event_hashtag` first.
- Model still proposes 4–6 topic hashtags (pass the messaging doc as today, so it picks from the approved list when one exists).
- Before assembling, run each model hashtag through the event's effective validation rules; **drop any hashtag that produces an error-level finding** (this is how BSS's approved-list rule is enforced without hard-coding the list in the app). De-duplicate case-insensitively.
- **DECISION (default assumed): event hashtag + model's pick, not the full approved list every time** (identical six-tag blocks on 150 posts read as automated).

### Stage 4 — X copy that fits without truncation

- Model returns `x_body` only (no hashtags), with the prompt stating an exact budget: `budget = 280 − (1 + length(event_hashtag))`, and the speakerLine requirement from Stage 2.
- Code: `x = x_body + " " + event_hashtag`. **DECISION (default assumed): X always ends with the event hashtag.**
- Replace `clampToX()` with a graceful trim, applied only if still over 280:
  1. Cut `x_body` back to the last complete sentence that fits the budget.
  2. If no sentence fits, cut at the last word boundary and append "…".
  3. Never cut inside the event hashtag, a URL or a word.
- Optional, recommended: if the model's `x_body` exceeds the budget, retry once with "Your X copy was N characters; rewrite it in under <budget>" before trimming.
- Same treatment for `generateSelfPromoPostCopy()` X copy.

### Stage 5 — Validate, then retry once

In `announcements/generate/route.ts` and `regenerate-copy`:

1. Generate as above; assemble LinkedIn and X.
2. `validateText()` both against the effective rule set.
3. If either has **error**-level findings, regenerate **once**: same prompt plus a short appended block listing each finding (`rule message` + `matched text`), instructing the model to rewrite only the variable parts to remove them. Re-assemble, re-validate.
4. Store the final copy and its findings. Store `validation_attempts` (1 or 2) on the announcement row so reviewers and we can see how often retry fires.
5. Warnings never trigger a retry.

**DECISION (default assumed): one retry.** Worst case is one extra Gemini call per announcement.

Keep generation non-blocking: if the retry still has errors, save the draft with findings exactly as today.

### Stage 6 — Carry-over fixes from the earlier note

From `speaker-own-facts-and-indian-honorifics.md`:

- **Facts-only scope:** in every `messagingContext` (generatePostCopy, generateSelfPromoPostCopy, generateHeadlines, generate-short-bio), scope the facts rule to claims about the EVENT and state that the speaker's own career details, including figures, may be used as given in the speaker data.
- **Hon'ble:** add `'honble'` to the `pronoun_style` CHECK constraint, `PRONOUN_GUIDANCE` (`'"Hon’ble" plus their office, e.g. "Hon’ble Minister", "Hon’ble Chief Minister" (not he/she)'`), and the speaker form dropdown ("Hon'ble (Indian ministers)").
- **normalizeTitle:** only replace "&" when the event's effective rule set contains an ampersand rule of severity `error`; BSS's is a warning, so official names like "Karnataka Vocational Training & Skill Development Corporation" pass through.

---

## 4. Non-negotiables

- **No unexpected change for other events.** With `announcement_line_emojis = false` and `announcement_cta_label` defaulting to today's wording, a DFS or WAIS announcement must read the same as before apart from: the title-line comma format, the X trim, and retry-on-error. Verify with the regression test below.
- **Never insert a date, venue, URL or hashtag the event record does not hold.**
- **Never auto-publish.** All of this happens before the draft row is written; approval flow unchanged.
- The messaging doc's rules still go into the prompt for the variable paragraphs; this build narrows what the model writes, it does not remove its grounding.

---

## 5. Acceptance criteria

**BSS test set** (event `27edfe37-ab45-4656-922d-0503012c75a7`, `announcement_line_emojis = true`):

| Speaker | Why chosen |
|---|---|
| Subroto Bagchi | Long bio with concrete figures; government-body title |
| Siegfried Leffler | Foreign speaker (Germany): country must appear |
| Arun Yogiraj | Empty company |
| Chetna Nagpal | Very long title (X budget stress test) |
| A government speaker once bio/photo exist (e.g. Uma Mahadevan, `pronoun_style = honble`) | Hon'ble handling |

Pass when, for all five, on first generation:

1. Zero error-level findings on LinkedIn and X.
2. Date/venue line reads exactly `📅 3–5 November 2026 | 📍 The Lalit Ashok Bengaluru, India`.
3. CTA reads `Register here: https://bengaluruskillsummit.com/get-involved/`.
4. `#BengaluruSkillSummit` is the first hashtag on LinkedIn and the last token on X; every hashtag is on the approved list.
5. X copy ≤ 280 characters, never ends in "…" unless trimming was genuinely unavoidable, never cuts a word or hashtag.
6. Speaker named as "<Name>, <Title>, <Company>"; no ", India" for Indian speakers; "Germany" present for Leffler; no dangling "at" for Yogiraj.
7. Speaker's own figures from the bio are allowed to appear.
8. Government speaker referred to as "Hon'ble …" after first mention, never "he/she".

**Regression:** generate one Dubai FinTech Summit speaker announcement before and after the build. No new validation findings; date/venue/CTA lines unchanged in wording; only differences are the title-line comma and X handling.

---

## 6. Out of scope, noted

- **Short bio hygiene:** 24 of 34 BSS speakers have a short bio over 500 characters (18 are the full bio pasted in). Operational fix is running "Generate Short Bio" per speaker. A "Generate short bios for all speakers over the limit" bulk action on the speakers list would save the team real time; build separately if wanted.
- **Judgemental validation** (tone, unsupported claims) remains out of scope, as in the reference-documents spec.
