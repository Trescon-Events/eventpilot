# Speaker's own facts in SAE copy + Indian honorifics

Status: proposed, not built. Raised 25 Sep 2026 while preparing Bengaluru Skill Summit 2026 for SAE.
Affects every event, not just BSS.

## 1. The facts-only rule strips speakers' own credentials (bug)

### What happens
Every SAE generator tells Gemini that messaging-doc `"kind":"facts"` sections are the ONLY permitted source for any statistic or figure. The post prompt also asks for a credibility line using the speaker's "years, scale, a notable achievement". The two collide: a speaker's "18+ years" or "operations in 60+ countries" is not in the event's facts, so the model drops it or goes vague. Short bios are hit hardest, since condensing a real bio is exactly where those details live.

The facts rule exists to stop invented EVENT claims (attendance, scale, forecasts). It was never meant to cover the speaker's own record.

### Where
- `app/lib/events/announcements.ts`: `generatePostCopy`, `generateSelfPromoPostCopy`, `generateHeadlines` (the `messagingContext` string in each)
- `app/api/events/stakeholders/speakers/[id]/generate-short-bio/route.ts` (`messagingContext`)

### Proposed change
In each `messagingContext`, scope the facts sentence to the event and add an explicit carve-out. Suggested wording:

> Any section with "kind":"facts" is the ONLY permitted source for a statistic, figure, attendance number, or scale claim about the EVENT; never state an event number that isn't grounded there. This does not apply to the speaker's own credentials: career details, years of experience, and achievements given in the speaker data or source bio above may be used as written.

For generate-short-bio, also note that a messaging-doc rule against superlatives or unsupported claims governs claims about the event, not how a speaker describes their own work in their own bio. (BSS decision, 25 Sep 2026: bio superlatives are fine.)

The BSS messaging doc now carries the same scope line in its own Writing standards ("These rules govern claims about the Summit…"), so BSS works either way. Other events (DFS etc.) only get the fix from this code change.

### Test
Regenerate a short bio for a speaker whose full bio has concrete figures (years, countries, headcount). Before: figures dropped or generalised. After: kept. Check that an event-scale claim not in facts (e.g. "10,000 attendees") is still refused.

## 2. No honorific option for Indian government speakers

### What happens
`event_speakers.pronoun_style` offers he/she plus His/Her Excellency and His/Her Highness (UAE protocol). A Karnataka minister gets "he", which breaks the BSS rule: after first mention, refer to a minister by office with the honorific ("Hon'ble Minister will…", "Hon'ble Chief Minister will…").

### Proposed change
- Migration: add `'honble'` to the `pronoun_style` CHECK constraint (see `supabase/sae_migration.sql` for the current list).
- `PRONOUN_GUIDANCE` in `announcements.ts`: add `honble: '"Hon’ble" plus their office, e.g. "Hon’ble Minister", "Hon’ble Chief Minister" (not "he/him"/"she/her")'`.
- Speaker form dropdown: add the option, labelled "Hon'ble (Indian ministers)".

## 3. Minor: normalizeTitle turns every "&" into "and"

`normalizeTitle()` (announcements.ts) replaces "&" in speaker titles to satisfy the DIFC ampersand rule. BSS official names legitimately contain "&" ("Karnataka Vocational Training & Skill Development Corporation"), so a title using that name would be silently altered. Low priority; the BSS ampersand rule is a warning, not an error. Possible fix: skip the replacement when the event has no ampersand rule, or keep an allowlist of official names.

## Related, already done (25 Sep 2026)
- `supabase/reference_documents_bss_seed_rules.sql`: 30 deterministic rules for BSS (not yet run).
- BSS messaging doc corrected via `Working_Files/_claude_bridge/bss_patch.py`.
