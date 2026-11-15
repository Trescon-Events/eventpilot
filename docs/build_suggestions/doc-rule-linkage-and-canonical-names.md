# Doc edits that flag affected rules + a canonical-name rule type

**Status:** proposed build, 30 Oct 2026. Small, additive, no change to how any event generates copy.
**Trigger:** first real self-service change on Bengaluru Skill Summit (BSS). The producer corrected the Minister's name in the live messaging doc ("Leadership reference" section, via the Event Details chat edit). The edit worked, but three BSS validation rules still hard-code the old spelling, so every correctly spelled invite or post is now flagged as an error and the old spelling passes. Nothing told her the rules needed changing.

Two gaps, two parts:

- **Part A:** a live-doc section edit does not tell the editor which validation rules mention the text they just changed.
- **Part B:** names and titles are protected with hand-written regex rules that embed the spelling (`bss-minister-old-spelling`, `bss-minister-missing-dr`, `bss-minister-dr-shri`). Changing one spelling means editing three regexes. A producer should change one field.

---

## Before you start

- You are mid-way through other work in this repo. Commit or stash it, and do this on its own branch.
- Read first: `app/api/events/stakeholders/messaging/[id]/propose-edit/route.ts`, `.../apply-edit/route.ts`, `app/api/events/validation-rules/route.ts`, `app/lib/content/rule-admin.ts`, `app/lib/content/rule-check.ts`, `app/lib/content/validate.ts`, `app/components/rules/RulesPanel.tsx`, and the Event Details page that hosts the live-doc chat.
- Verify whether `event_validation_rules.rule_type` has a CHECK constraint (it had none in the original Stage 3 migration; confirm). Part B needs the new type allowed.

---

## Part A — "This edit affects N rules"

### Behaviour
When a producer proposes or applies a chat edit to a **live** doc's section, show which of the effective rules (event, umbrella, Trescon-wide: the same set `GET /api/events/validation-rules` returns) mention text the edit removes or replaces, and offer to update each one. **Never change a rule automatically.**

### How
1. **Diff.** New pure helper `app/lib/content/edit-diff.ts`: `changedPhrases(oldText, newText): Array<{ removed: string; added: string }>`. Word-level LCS diff of the section content (stringify non-string content the way apply-edit already does). Pair each contiguous removed run with the adjacent added run (empty `added` if pure deletion). Ignore runs under 4 characters and pure punctuation/whitespace changes. Also emit a sub-word pair when a single word changed (e.g. `Sharanaprakash` → `Sharanprakash`), since that is the common case.
2. **Match.** New helper `affectedRules(rules, pairs)`: a rule is affected when any `removed` phrase appears (case-insensitive) in its `pattern` (after JSON-decoding for JSON types, so `canonical`, `trigger`, `allowed[]`, `a`, `b` are all searched) or its `message`. Return `{ rule_id, rule_key, level, can_edit, field: 'pattern'|'message', removed, added, suggested_pattern, suggested_message }`, where the suggestions are the same field with `removed` replaced by `added` (all occurrences, case preserved as in the rule).
3. **Propose step.** `propose-edit` (live docs, `section_id` mode): for each proposal, compute pairs and affected rules, and return them as `affected_rules` alongside the proposal. The producer sees it **before** applying: "This change also affects 3 checks: bss-minister-old-spelling, … Review them after applying."
4. **Apply step.** `apply-edit` (section, live doc): after the write succeeds, recompute and return `affected_rules` in the response (the doc may have changed between propose and apply).
5. **UI.** In the live-doc chat panel, after a successful apply, show a card listing affected rules with **Old → Suggested** for each changed field and two buttons per rule:
   - **Update rule:** calls the existing `PATCH /api/events/validation-rules?id=…` with the suggested pattern/message. The existing checks (`checkRuleDraft`, fixed-line warning, audit log) apply unchanged; surface the 409 "acknowledge" flow the same way RulesPanel does.
   - **Leave as is:** dismiss.
   Rules the producer cannot edit (`can_edit=false`, e.g. Trescon-wide) are listed read-only with "Ask an admin to update this rule."
   Include a link "Open all rules" to the Setup tab's RulesPanel.
6. **Audit.** No new table. The rule PATCH is already logged in `validation_rule_changes`; the doc edit is already logged in `event_messaging_doc_edits`. Add the doc edit id to the PATCH body as optional `source_doc_edit_id` and store it in the `validation_rule_changes.after` JSON (or a new nullable column) so the two can be traced together.

Scope note: draft-doc review (pre-approval, whole-document) is out of scope; rules are usually set up after approval.

---

## Part B — `canonical_name` rule type

### What it checks
One rule per protected name or title. Pattern JSON:

```json
{ "canonical": "Dr. Sharanprakash Rudrappa Patil", "loose": "Sharan\\s?a?\\s?[Pp]rakash" }
```

- `canonical`: the exact approved form (what the producer edits).
- `loose`: a regex that catches any attempt at the name, right or wrong.

Every match of `loose` is flagged **unless** that occurrence sits inside an exact occurrence of `canonical` (compute canonical match spans in the text; a loose match is fine if its offset falls inside one). Finding carries `suggested_fix = canonical`. Message default: `Use the approved form: "<canonical>".`

Examples with the BSS rule above:

| Text | Result |
|---|---|
| `Dr. Sharanprakash Rudrappa Patil will inaugurate` | clean |
| `Dr. Sharanaprakash Rudrappa Patil` | flagged (old spelling) |
| `Shri Sharanprakash Rudrappa Patil` | flagged (missing "Dr.") |
| `Dr. Shri Sharanprakash Rudrappa Patil` | flagged (double honorific) |
| `Hon'ble Minister will take part` | clean (no name) |

One rule replaces all three BSS hand-written rules.

### Build
1. `validate.ts`: add `'canonical_name'` to `RuleType`; implement `checkCanonicalName` as above; document it in the header comment. Case-sensitive on `canonical`, regex as written for `loose` (no inline flags, same as forbidden_pattern).
2. `rule-check.ts`: add to `RULE_TYPES`; shape check: valid JSON, `canonical` non-empty string, `loose` a valid regex (reuse `checkRegex`); **error** if `loose` does not match `canonical` itself (otherwise the rule can never pass correct text); **warning** if `loose` is shorter than 5 characters.
3. Migration: allow `'canonical_name'` in `rule_type` if a CHECK constraint exists.
4. `RulesPanel.tsx`: add to `TYPE_HELP`. For this type, render two plain fields, **Approved form** (`canonical`) and **Also catch** (`loose`), instead of a raw JSON box, and serialise to JSON on save. Pre-fill `loose` with a suggestion generated from `canonical` (helper: take the most distinctive word in canonical, at least 6 characters, and make vowels optional between consonants, e.g. `Sharan\s?a?\s?prakash`; producer can edit). Show "Approved form" prominently in the rule list for this type so a producer recognises the name at a glance.
5. Part A integration: `affectedRules` already searches JSON-decoded fields, so a doc edit that changes the name will offer to update `canonical` directly. This is the main self-service path: edit the name in the doc, click **Update rule**, done.

### Not in this build
Auto-generating canonical-name rules from the leadership reference section. Worth doing later (the suggested-rules flow is the natural home), but Part A + Part B already make a name change a two-click job.

---

## Non-negotiables

- **No change to generation or to any existing rule's behaviour.** This is additive: a new rule type that nothing uses until someone creates one, and a suggestion card that only appears after a live-doc edit.
- **Rules are never changed without a person clicking Update.** Same permissions as today (`sae.forms.manage` for event rules).
- Do not migrate or edit any BSS rule in code. Switching BSS to the new rule is the producer's job through the Rules screen; that is the self-service test.

---

## Acceptance

On BSS (`27edfe37-ab45-4656-922d-0503012c75a7`), as a user with `sae.forms.manage` but not admin:

1. In the live doc, select **Approved quotes**, ask the chat to change `Dr. Sharanaprakash Rudrappa Patil` to `Dr. Sharanprakash Rudrappa Patil` in the attribution line. The proposal shows that `bss-minister-old-spelling`, `bss-minister-missing-dr` and `bss-minister-dr-shri` are affected.
2. After applying, the card lists the same three with Old → Suggested values; **Update rule** on each succeeds and appears in `validation_rule_changes` with the doc edit linked.
3. In the Rules screen, create a `canonical_name` rule with Approved form `Dr. Sharanprakash Rudrappa Patil`; the Also-catch suggestion is pre-filled; saving with a `loose` that does not match the canonical form is blocked.
4. Rules test box: the five example texts in the table above give exactly the results shown.
5. The producer can switch the three old rules off (`is_active=false`) from the Rules screen; the test box results stay the same.
6. Regression: generate one DFS announcement; validation findings identical to before the build.
