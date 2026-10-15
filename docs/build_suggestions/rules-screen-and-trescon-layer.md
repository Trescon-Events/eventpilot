# Content setup: rules screen and the Trescon-wide layer

Date: 2026-10-15. Phase 1, builds 4 and 8a of the content-setup hardening plan. Agreed with Madhu.
Builds on Phase 0 (`sae-readiness-and-setup-approval.md`, live 15 Oct).

## Why

1. **Rules are managed by SQL.** Every validation rule so far was written as SQL by Madhu or Claude: the DFFW seed, the BSS seed, the superlative warnings, the announce-filler rule. Two scripts failed on constraints, and one was run against the wrong Supabase project. Producers cannot add, disable or adjust a rule without help.
2. **House rules are mixed in with client rules.** Trescon's house rules sit at DIFC's umbrella level today (`trescon-no-announce-filler`), mixed with DIFC's rules. Madhu decided (14 Oct, Option A) that house rules live in **one Trescon-wide set, applied to every event below client rules**.
3. **There is no level above an umbrella.** Madhu also decided on one **Trescon-wide style guide**, plus **one style guide per series** (World AI Show, World Cyber Security Show). Trescon-owned events therefore need a level above the umbrella, which does not exist yet.

## Non-negotiables

1. **The six live events are untouched**, apart from the one data move in Part 1. Those events are DFS, FSF, FIFF, FTF, DFWS and BSS. Their effective rule set after the build must produce the same findings on the same text as before.
2. **Client documents always outrank anything Trescon-wide.** A Trescon-wide document or rule never wins a conflict against an event's or umbrella's own document.
3. **Every rule change is recorded** (who, when, before and after). Changes already alter the Phase 0 fingerprint, so an enforced event needs re-approval, as intended.
4. **No auto-activation.** Suggested rules from clarification answers still need a person to accept them.

## Part 1: data model

**A Trescon-wide owner.** Today content belongs to an event XOR an umbrella (`ContentOwnerRef`, CHECK constraints in `umbrella_events_separation_migration.sql`). Add a third kind, `{ kind: 'org' }`, for Trescon-wide content.
- Add `org_scope TEXT` (value `'trescon'`, nullable) to `event_validation_rules` and `event_messaging_docs`.
- Change each CHECK to "exactly one of `event_id`, `umbrella_id`, `org_scope` is set".
- Add a partial unique index per owner column, the same pattern as today (Postgres NULLs do not collide in a shared index).

**Rule origin.** Add `origin TEXT NOT NULL CHECK (origin IN ('client','trescon'))` to `event_validation_rules`. Backfill:
- `difc-*` and `bss-*` rules → `client`. The BSS rules were derived from the KSDC-approved document and Madhu's decisions on it.
- rules accepted through the suggested-rules flow → `client`.
- **Move** `trescon-no-announce-filler` from the DFFW umbrella to `org_scope = 'trescon'` with `origin = 'trescon'`. The pattern, severity and message stay identical, and DFFW still inherits it through the Trescon-wide layer.
- Show the backfill result to Madhu before committing.

**Inherited-rule override.** Add a new table `event_rule_overrides (id, event_id NULL, umbrella_id NULL, rule_key, is_disabled BOOLEAN, reason TEXT, created_by, created_at)`, with exactly one of `event_id` or `umbrella_id` set. It lets an event or umbrella switch off an inherited rule without deleting it. Example: if the Trescon-wide set ever bans "premier", BSS can switch that rule off, because its client document permits "premier". A reason is required.

**Audit.** Add `validation_rule_changes (id, rule_id, owner, action create|update|disable|enable|delete, before JSONB, after JSONB, changed_by, changed_at)`.

**Series umbrella.** `event_umbrellas.type` already exists and is nullable. Use `type = 'series'` for Trescon-owned series such as World AI Show. Verify what Staff Portal sends today. If umbrellas can only come from Staff Portal, add a minimal admin action:
- create a series umbrella in EventPilot;
- attach an existing event to it, writing `events.umbrella_id`;
- respect the 12 Oct sync rule that keeps an EventPilot-set umbrella.

## Part 2: resolution order

**Effective rules for an event:** the event's own active rules, plus its umbrella's, plus the Trescon-wide rules (`org_scope = 'trescon'`), minus any `rule_key` disabled by an override on that event or its umbrella. Effective rules for an umbrella are its own rules plus the Trescon-wide rules, minus its overrides.

**Duplicate rule keys.** The most specific owner wins: event, then umbrella, then Trescon-wide.

**Effective documents.** Trescon-wide documents are added for an event only when:
- the event is Trescon-owned (`events.type` is not `managed`; check the stored values with `SELECT DISTINCT type FROM events`); **and**
- its umbrella, if it has one, is not a client umbrella (`type` is `series` or empty, and `client_name` is empty).

DFFW children and BSS therefore get the Trescon-wide **rules** but never the Trescon-wide **style guide**.

**Compile order.** Trescon-wide documents always sort after every event and umbrella document, whatever their `authority_rank`, and are labelled "Trescon-wide" in the compiled reference. On a conflict, the more specific document wins and the Trescon-wide section is recorded as the flagged loser. Never resolve silently.

**Recompile.** Approving a Trescon-wide document recompiles every Trescon-owned event. Changing a Trescon-wide rule needs no recompile (rules are resolved at generation time), but it changes fingerprints. Grandfathered events show the amber banner; enforced events need re-approval.

## Part 3: rules screen

One component, used in three places:
- the Event Details **Setup** tab, as a "Rules" section;
- the umbrella workspace's Reference Documents page;
- a new admin page **Trescon house style** (`/admin/content/house-style`), which also holds the Trescon-wide style guide upload.

**What it shows.** Effective rules grouped by level (Trescon-wide, umbrella, this event). For each rule: key, type, pattern, severity, message, source clause, origin (client or Trescon), active state, and "inherited" when owned higher up.

**Actions:**
- **Add rule.** Type picker (`forbidden_term`, `forbidden_pattern`, `required_format`, `proximity`) with a plain-language helper per type. Required: message, origin, and source clause (for example "DIFC style guide §9" or "Trescon house rule").
- **Edit** severity, message or pattern, and **disable or enable** a rule owned at this level.
- **Switch off an inherited rule** (writes an override, with a reason).
- **Test box.** Paste sample text and see the findings live, using `validate.ts` with the effective rule set plus the draft rule.

**Validation on save:**
- compile the regex and reject it if invalid;
- reject `(?i)` and other inline flags, with a hint that `forbidden_term` is already case-insensitive and `forbidden_pattern` is case-sensitive;
- warn when the pattern matches the empty string;
- warn when it already matches the event's fixed lines (date, venue, attribution, CTA). A rule that fires on every post is almost certainly wrong.

**Permissions:**
- event rules: `sae.forms.manage`;
- umbrella rules: `sae.messaging.umbrella_manage`;
- Trescon-wide rules and documents: platform admins only, which today means Madhu.

**Suggested rules.** The existing suggested-rules panel writes into the same table, with `origin = 'client'` by default and editable before accepting.

## Checks before push

1. **Same findings on live events.** For DFS, FSF, FIFF, FTF, DFWS and BSS, run `validate.ts` on their last 5 stored posts with the old and new resolution. The findings must be identical.
2. **The moved rule still applies.** After the move, a DFWS test text containing the filler phrase is flagged by `trescon-no-announce-filler`, now shown as Trescon-wide, inherited.
3. **Overrides.** Add a Trescon-wide test rule, switch it off on BSS with a reason, and confirm it does not fire on BSS but does on FSF. Delete the test rule afterwards.
4. **Style guide reach.** Upload a dummy Trescon-wide style guide. It appears in the compiled reference of a test Trescon-owned event, sorted after the event's own documents, and does **not** appear for DFS or BSS. Delete the dummy afterwards.
5. **Rule validation.** An invalid regex and `(?i)` are rejected. A pattern matching "5 November 2026" warns that it hits the fixed lines.
6. **Audit and re-approval.** Each change above shows in `validation_rule_changes`. A rule change on an enforced test event locks it until re-approved. On a grandfathered event it shows the amber banner only.
7. **Series umbrella.** Create a test series umbrella, attach a test event, run a Staff Portal sync, and confirm the attachment survives.

Report results to Madhu before pushing. Do not change any reference document on the six live events.
