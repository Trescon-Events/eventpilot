# forbidden_term does not match inflected or suffixed forms

**Found:** 2026-09-30, reviewing the first run of engine-drafted FSF speaker
announcements.

## The bug

`checkForbiddenTerm` in `app/lib/content/validate.ts` builds its regex as:

```ts
const re = safeRegex(`\\b${escapeRegex(rule.pattern)}\\b`, 'gi')
```

The trailing `\b` requires a non-word character after the term. So the rule
`seamless` does not match **seamlessly** — a word character follows, the
boundary fails, and no finding is produced.

An FSF speaker announcement went out of generation with "she **seamlessly**
bridges strategy and implementation" and zero validation findings. `seamless`
is an error-severity banned word under style guide §9.

This affects every `forbidden_term` rule in the set. Live examples of forms
that currently escape: *seamlessly, seamlessness, unlocking, unlocked,
unlocks, revolutionising, revolutionised, unprecedentedly, game-changer*.

## The fix

Allow a lowercase suffix after the term, keeping the leading boundary:

```ts
function checkForbiddenTerm(text: string, rule: ValidationRule): ValidationFinding[] {
  // Trailing \b alone misses inflections — "seamless" must also catch
  // "seamlessly". [a-z]* absorbs the suffix; the trailing \b still
  // prevents a match running into a following word.
  const re = safeRegex(`\\b${escapeRegex(rule.pattern)}[a-z0-9]*\\b`, 'gi')
  return re ? collectMatches(re, text, rule) : []
}
```

`m[0]` then reports the inflected form actually found ("seamlessly"), which
is what the reviewer needs to see, so `ValidationFinding.match` stays useful
with no other change.

## Checked against the current 13 terms

All 13 DFFW `forbidden_term` rules were checked for an innocent longer form
that this would newly flag. There is none:

`DFFW · DFWS · FIFF · FSF · FTF · and beyond · game-changing · revolutionise ·
seamless · transformative · unlock · unprecedented · world-class`

Two notes on the edge cases:

- The rule is compiled with the `gi` flag, so `[a-z0-9]*` is case-insensitive
  and absorbs UPPERCASE letters too (corrected 2026-09-30 — this note used to
  claim otherwise). `FSF` therefore also newly matches `FSFs`, `FSFxyz` and
  `#FSF2026`, and `seamless` matches `SEAMLESSLY`. That is wanted: these are
  banned words, and the reviewer sees the whole offending token.
- `transformative` gains `transformatively` only. It does **not** gain
  `transformation`, because the stem differs ("transformativ" vs
  "transformat"). This matters: `transformation` is explicitly PERMITTED
  under the FSF production pack v1.1 §9, and must stay permitted.

## Do not do this instead

Adding `forbidden_pattern` rules with `[a-z]*` per term was considered and
rejected. `forbidden_pattern` is case-sensitive, so each would need character
classes (`[Ss]eamless…`) — the same trap that silently killed two rules when
`(?i)` was used. It would also double-report every term whose base form the
pattern still matches. One line in `validate.ts` is correct; thirteen
hand-written regexes are not.

## Test

These are pinned in `app/lib/content/validate.test.ts`
(`npx tsx --test app/lib/content/validate.test.ts`):

```ts
validateText('she seamlessly bridges strategy', [seamlessRule])
// expect 1 finding, match === 'seamlessly'

validateText('#FSF2026', [fsfRule])
// expect 1 finding, match === 'FSF2026'

validateText('the Premier League final', [premierRule /* warning */])
// expect 1 finding — premier is warning-severity precisely because of proper nouns like this

validateText('business transformation and digital strategy', [transformativeRule])
// expect 0 findings
```

## Note on existing announcements

Findings are computed once at generation and stored on
`stakeholder_announcements.validation_findings`. They are not recomputed.
Announcements drafted before this fix keep their clean findings and will not
retroactively flag. Regenerate anything still in review.

## Added 2026-09-30: the suffix class must include digits

The fix was first written as `[a-z]*`. That is not enough, and the case
that proves it is the most important prohibition in the whole set.

`#FSF2026` does not match the `FSF` rule today, and does not match it under
`[a-z]*` either — the suffix is digits. It matches only under `[a-z0-9]*`.

Tested:

| text | current `\b…\b` | `[a-z]*` | `[a-z0-9]*` |
|---|---|---|---|
| `#FSF2026` | no match | no match | **FSF2026** |
| `she seamlessly bridges` | no match | **seamlessly** | **seamlessly** |
| `business transformation` | no match | no match | no match |
| `the FSF agenda` | FSF | FSF | FSF |

The `match` column reports the whole token that matched (`m[0]`), not the
bare rule term — so `#FSF2026` reports `FSF2026` (corrected 2026-09-30; an
earlier version of this table said `FSF`).

`business transformation` stays unmatched under all three, which is
required — it is explicitly permitted (FSF production pack §9).

This is worth more than a cleaner finding. `filterHashtags` in
`app/lib/events/announcements.ts` (~line 206) DROPS any proposed hashtag
that produces an error-level finding. `difc-banned-abbr-fsf` is
error-severity. So with `[a-z0-9]*`, `#FSF2026` stops being a thing a
producer has to catch — the engine strips it before the draft is stored.
`#FSF2026` appears in nine of the nineteen published FSF posts, so this is
the failure the rule was written for, and it has never once fired.

Use `[a-z0-9]*`, not `[a-z]*`.
