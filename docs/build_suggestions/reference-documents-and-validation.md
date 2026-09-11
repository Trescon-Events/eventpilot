# Reference Documents, Umbrella Inheritance and Content Validation

**Status:** Proposed build. Agreed with Madhu 2026-09-10.
**Author:** Drafted with Claude from a working session on Dubai FinTech Summit 2026.
**Pilot event:** Dubai FinTech Summit 2026, under the Dubai Future Finance Week umbrella.
**First consuming module:** Speaker Announcement Engine (SAE).

---

## 1. Why this exists

EventPilot currently assumes **one messaging document per event**, authored by whoever runs the
event, with no notion of who approved it or what outranks what. That assumption holds for
signature events like World AI Show Malaysia, where Trescon owns the event and the document.

It breaks on Dubai FinTech Summit, where three documents govern the content at three different
authority levels, owned by two different organisations:

| Document | Owner | Scope | Authority |
|---|---|---|---|
| Dubai Future Finance Week tone and style guide | DIFC | All five DFFW events | Highest, non-negotiable |
| DFS 2026 approved messaging reference | DIFC | DFS only | Second |
| Trescon production pack (to be authored) | Trescon | DFS only | Third, derived only |

Two facts about the DIFC documents drive the whole design:

1. The approved reference states that **every individual asset** — campaign copy, emails, social
   posts, advertisements, brochures, presentations, scripts, website copy, and partner or sponsor
   communications — **must be shared with DIFC for final approval before release or deployment**.
2. It states that **Trescon must not introduce or restate unsupported facts, rankings, names,
   attendance forecasts, access claims, or third-party commitments.**

If EventPilot flattens all three documents into one uploaded PDF (the zero-code option), it cannot
tell a DIFC-approved line from a Trescon-assembled one, and it will generate assets that assert
unapproved claims with the same confidence as approved ones. That is precisely the failure the
DIFC front matter is written to prevent.

---

## 2. Current state — verified 2026-09-10

Read before building. These are the files that matter and what they currently do.

### 2.1 Umbrella linkage — data exists, no behaviour

`supabase/staff_portal_sync_migration.sql` (2026-09-10) added:

```sql
ALTER TABLE events ADD COLUMN parent_event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN staff_portal_umbrella_id UUID;
CREATE INDEX idx_events_parent_event_id ON events(parent_event_id) WHERE parent_event_id IS NOT NULL;
```

**Nothing in `app/` reads either column.** A search of `app/**/parent*` returns no matches. The
umbrella exists as data with no inheritance, no UI and no API. All of that is to build.

### 2.2 Messaging document pipeline — works, keep its shape

- `app/api/events/stakeholders/messaging/route.ts` — `GET` (live doc, or `?all=true` for versions)
  and `POST` (multipart PDF upload). Upload runs `STRUCTURE_PROMPT` through Gemini, producing
  `{ sections[], default_fields }`, stored as **draft**. PDF only, 20 MB cap.
- `app/api/events/stakeholders/messaging/[id]/propose-edit/route.ts` and `apply-edit/route.ts` —
  conversational review of a draft, covering both sections and `default_fields`.
- `app/api/events/stakeholders/messaging/[id]/approve/route.ts` — flips draft to `live`, marks the
  previous live doc `superseded` with `superseded_by`, and writes `default_fields` into the
  `events` table's tracked columns, logging each change to `event_details_field_changes` with
  `change_source = 'ai_extraction'`.
- `app/admin/events/[id]/details/page.tsx` — the single UI, two tabs (`overview` | `messaging`).
- `app/admin/events/[id]/messaging/page.tsx` — legacy redirect, leave alone.

Section shape today:

```ts
type SectionKind = 'text' | 'table' | 'facts' | 'rules'
type Section = {
  id: string; order: number; title: string; kind: SectionKind; content: unknown
  updated_at?: string; updated_by?: string | null; change_note?: string | null
}
```

`facts` content is already `[{ fact, detail, source? }]` — a sourced reference bank.
`rules` content is markdown-lite, and `STRUCTURE_PROMPT` already documents rules sections as
constraints that downstream consumers treat as non-negotiable.

**Both of the structures we need already exist.** This build is about authority and enforcement,
not about new content types.

### 2.3 The one-live-doc assumption

`event_id + status='live'` is queried in three places, all of which must become role-aware:

1. `app/api/events/stakeholders/messaging/route.ts` — `GET`
2. `app/api/events/stakeholders/messaging/[id]/approve/route.ts` — the supersede step
3. `app/api/events/stakeholders/announcements/generate/route.ts` — SAE reads
   `structured_json` straight into the Gemini prompt

### 2.4 Client approval already exists

Relevant migrations: `announcement_client_approval_migration.sql`,
`announcement_two_layer_approval_migration.sql`, `client_approval_contacts_migration.sql`.

Relevant routes under `app/api/events/stakeholders/announcements/[id]/`:
`send-for-client-approval/compose` and `/send`, `approve`, `bypass-approval`,
`client-approval-cc`, `send-for-approval`.

**Do not rebuild any of this.** The DIFC release gate is a configuration and sequencing problem on
machinery that already works. Note that `publish-check/route.ts` is Postiz status polling, *not*
content validation — content validation is genuinely new.

### 2.5 Event type

`events.type` is `TEXT` with **no CHECK constraint** in `core_schema.sql`. The knowledge base
uses `managed` and `signature` as the two categories. **Verify actual stored values before
relying on them** — query `SELECT DISTINCT type FROM events` and handle whatever is there.
Managed events have an external client; signature and flagship events are Trescon-owned with no
external approver.

---

## 3. What to build

Four stages. Build all four; stage 4 is what makes 1–3 do anything.

### Stage 1 — Document model

Add to `event_messaging_docs`:

| Column | Type | Notes |
|---|---|---|
| `role` | TEXT NOT NULL DEFAULT `'messaging'` | `style_guide` \| `messaging` \| `production_pack` |
| `authority_rank` | INTEGER NOT NULL DEFAULT 1 | Lower wins. Independent of attachment level. |
| `provenance` | TEXT NOT NULL | `client_approved` \| `trescon_authored` |

Change live-doc uniqueness from one per event to **one per (event, role)**.

`provenance` defaults at insert time by rule, and is overridable by the producer:

- `role = 'production_pack'` → always `trescon_authored`
- event's `type` is signature/flagship (no external client) → `trescon_authored`
- otherwise → `client_approved`

Add to sections in `structured_json`: `diverged_from_source` (boolean, default false), set to
`true` whenever `apply-edit` modifies an extracted section. Surface it as a visible badge in the
producer UI and carry it into the compiled reference.

> **Why the badge matters.** Producers must be able to fix Gemini extraction errors — extraction
> from PDF does drop content. But an unflagged edit to a DIFC rule is invisible drift between what
> the app enforces and what DIFC actually issued, and nobody notices until DIFC queries an asset.
> Timestamps answer "who changed this" after the fact; the badge prevents the drift being silent.

**Backfill:** every existing doc → `role = 'messaging'`, `authority_rank = 1`, and `provenance`
by the rule above. Behaviour for any event with a single messaging document must be **identical
to today**.

### Stage 2 — Inheritance and compile

**Resolver.** Given an event, walk `parent_event_id` to build the effective document set: the
event's own live documents plus every live document on its umbrella. Guard against cycles and cap
depth at 2 (umbrella → event); DFFW is a one-level initiative, not a deep tree.

**Compile.** Produce a materialised `event_compiled_reference` row per event:

- Sections merged in `authority_rank` order, then document order.
- Every section carries `source_doc_id`, `source_doc_title`, `role`, `authority_rank`,
  `provenance`, and `diverged_from_source`.
- `rules` sections deduplicated across documents.
- Where two documents state conflicting rules on the same subject, the **higher rank wins and the
  loser is recorded as a flagged conflict** for a human to see. Never resolve silently.

Recompile whenever any source document in the effective set is approved. Materialise rather than
compute on read, so you can point at exactly what produced a given asset months later.

**Umbrella documents change every child at once.** Gate uploading a document to an umbrella event
behind a higher permission than `sae.forms.manage` — that is a Corporate Marketing Director
decision, not a producer one.

### Stage 3 — Deterministic validation

New table `event_validation_rules`, attachable at umbrella **or** event level (an event's
effective rule set is its own plus its umbrella's):

| Column | Notes |
|---|---|
| `id` | |
| `event_id` | umbrella or child |
| `rule_key` | stable slug, e.g. `difc-banned-word-transformative` |
| `rule_type` | `forbidden_term` \| `forbidden_pattern` \| `required_format` \| `proximity` |
| `pattern` | regex or literal |
| `severity` | `error` \| `warning` |
| `message` | what the writer sees |
| `source_clause` | e.g. `Style guide §9` — so a producer can check the original |
| `is_active` | |

New library `app/lib/content/validate.ts`, pure and synchronous, no model call. Takes text plus a
rule set, returns `{ rule_key, severity, message, source_clause, match, offset }[]`.

**Seed rule set for DFFW** (attach at umbrella level so all five events inherit). Derived from the
DIFC tone and style guide and the DFS approved reference:

| Rule | Type | Detail | Source |
|---|---|---|---|
| Banned words | forbidden_term | `unlock`, `seamless`, `world-class`, `and beyond`, `game-changing`, `revolutionise`, `transformative`, `unprecedented` | §9 |
| Banned abbreviations | forbidden_term | `DFFW`, `FSF`, `FIFF`, `FTF`, `DFWS` | §4 |
| Em dash | forbidden_pattern | `—` | §7 |
| "the DIFC" | forbidden_pattern | `\bthe DIFC\b` | §7 |
| Lower-case fintech | forbidden_pattern | `\bfintech\b` (case-sensitive, not `FinTech`) | §7 |
| US currency style | forbidden_pattern | `US\$`, `\d+\s+(billion\|million)` | §8 |
| Abbreviated month in date | forbidden_pattern | `\d{1,2}\s*-\s*\d{1,2}\s+(Jan\|Feb\|Mar\|Apr\|Jun\|Jul\|Aug\|Sep\|Oct\|Nov\|Dec)\b` | §8 |
| Standalone digit under 10 | forbidden_pattern | `\b[0-9]\b` not adjacent to a unit or in a range | §8 |
| Ampersand | forbidden_pattern | `&` outside an official name allowlist | §7 |
| Sentence starting "Being" | forbidden_pattern | `(^\|\.\s)Being\b` | §7 |
| Theme string | required_format | Only `Connecting Markets, Transforming Economies.` or the two-line form | Reference, style section |
| Protocol string | required_format | If `Sheikh Maktoum` appears in a first reference, the full approved title string must match exactly | Reference, style section |
| **Scale figure in future tense** | **proximity** | A figure matching `(10,000\|1,000\|300\|200\|120)\+` within N characters of `join`, `meet`, `connect with`, `be part of`, or `2026` | Reference, style section |

> The proximity rule is the most valuable and the least obvious. *"Join 10,000+ business leaders at
> Dubai FinTech Summit 2026"* contains no banned word and reads perfectly well. It breaches the
> rule DIFC wrote into the approved reference. Only a proximity check catches it.

**Hooks:**

1. `app/api/events/stakeholders/announcements/generate/route.ts` — run after Gemini returns copy,
   before the draft row is written. Store findings on the announcement row so they render in the
   review UI. Do **not** block generation; surface findings.
2. A standalone "check this copy" endpoint and admin UI so Fouzan, Khalifa and anyone else can
   paste hand-written copy and check it against the event's rule set.

Judgemental validation (implied privileged access, guaranteed outcomes, unsupported statistics,
generic promotional fluff) is **explicitly out of scope for this build**. It needs a corpus of real
generated output with known verdicts to tune against, and this build produces that corpus.

### Stage 4 — Wire the consumers

**SAE reads the compiled reference**, not the raw live doc. Replace the `event_messaging_docs`
query in `announcements/generate/route.ts` with a compiled-reference read. Pass `rules` sections
into the prompt as hard constraints and `facts` sections as the only permitted source of figures.

**Release gate.** Add `requires_client_approval` (BOOLEAN, nullable) to `events`. Settable at
umbrella and event level; when null on a child, inherit from the umbrella; an explicit value on
the child overrides. Expose as a tickbox in Event Details settings — **not** all managed-event
clients demand approval on every asset, so this must be opt-in per event rather than derived from
`type`.

Where it is on, **client approval comes first**, before any internal approval step or publish
path. Reuse the existing `send-for-client-approval` flow. SAE is the day-one consumer; every later
module inherits the same gate.

---

## 4. Non-negotiables

- **No behaviour change for single-document events.** WAIS Malaysia and every other existing event
  must work exactly as before, with no per-event configuration.
- **Never silently resolve a conflict** between two source documents. Higher rank wins, loser is
  flagged.
- **Never let generation assert a `trescon_authored` line as approved.** Provenance travels with
  every section into the compiled reference and into the generation prompt.
- **Do not modify `STRUCTURE_PROMPT`'s section kinds.** `text` / `table` / `facts` / `rules` are
  correct and already understood by the extraction. Add fields around them, not new kinds.
- **Do not rebuild client approval.** Extend and sequence what exists.

---

## 5. Acceptance criteria

1. DFFW exists as an umbrella event with five children; the DIFC style guide is uploaded once at
   umbrella level and appears in all five children's effective document sets.
2. DFS 2026 has its own approved reference at `authority_rank` 2 and the style guide inherited at
   rank 1; the compiled reference shows both, each section labelled with its source and provenance.
3. A rule conflict between the two documents surfaces as a visible flag, not a silent merge.
4. A producer editing an extracted section causes that section to display a divergence badge.
5. The seeded DFFW rule set catches, at minimum: `transformative`, `DFFW`, an em dash, `US$ 3.16
   billion`, `2-3 Nov 2026`, and `Join 10,000+ business leaders at DFS 2026`.
6. SAE generation for a DFS speaker returns copy plus any validation findings, and cannot reach a
   publish path without passing through client approval first.
7. Generating a WAIS Malaysia announcement behaves exactly as it did before this build.

---

## 6. Open items, deliberately deferred

- **Trescon production pack contents.** The pack (fact register with per-fact permitted-use rules,
  copy blocks with provenance pointers, authored machine-executable rules) is a content
  deliverable, not a code one. It is drafted separately and uploaded as a `production_pack`
  document at rank 3. The build must accept it; it does not need to exist first.
- **Judgemental validation.** See Stage 3.
- **Portfolio or client level attachment.** The umbrella level is sufficient for DFFW. The style
  guide is scoped to the 2026 cycle and will be reissued, so it is umbrella-and-cycle material
  rather than client-permanent material. Revisit only if a second concurrent umbrella appears.
- **Partner events.** DFFW includes events organised by third parties. Confirmed: these will never
  exist in EventPilot. No managed-versus-partner distinction is needed on children.

---

## 7. Known defect to carry, not fix

The DFS approved reference contains a dangling cross-reference: its AI and ESG bullet ends
"All other abbreviations follow the expand-on-first-mention rule below", and no such rule appears
below it. The three sections that carried it in the earlier draft (Language and grammar,
Vocabulary, Number formatting) are absent from the approved version.

Nothing governing is lost — the style guide covers all of it in §7–§9, and outranks. **Do not edit
the approved reference to fix this.** There is no further DIFC approval round. The
expand-on-first-mention rule is carried in the Trescon production pack instead, noted as derived
from the superseded draft plus style guide §7.
