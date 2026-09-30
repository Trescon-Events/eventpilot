# Fixed attribution line for announcements

**Why:** DIFC portfolio events other than Dubai FinTech Summit require
`Organised by Dubai International Financial Centre (DIFC) and part of Dubai
Future Finance Week.` on every stakeholder announcement. The generation
prompt asks for five paragraphs (hook, announcement, credibility, dates,
CTA) and has no slot for it, so drafts carried it unpredictably. The
production pack currently tells producers to add it by hand at review —
a step that will be missed.

Mirror `announcement_cta_label` exactly.

## 1. Column

`supabase/sae_attribution_line_migration.sql` adds:

```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS announcement_attribution_line TEXT;
```

NULL (the default, every existing event) = no attribution line, behaviour
unchanged. Only an event that sets a value gets one.

## 2. `app/lib/events/announcements.ts`

Add to `EventContext` (next to `announcement_cta_label`):

```ts
  // NULL (the default) means no attribution line — same gating as
  // announcement_cta_label. When set, inserted verbatim as its own
  // paragraph directly after the date/venue line.
  announcement_attribution_line?: string | null
```

Add a builder beside `buildFixedCtaLine`:

```ts
// 'assembled' mode only. Reused VERBATIM from the event record — this is
// approved client wording and the model must never rewrite or extend it.
function buildAttributionLine(event: EventContext): string | null {
  return event.announcement_attribution_line?.trim() || null
}
```

In `assembleOrgPromoCopy`, insert it between the date/venue line and the
CTA:

```ts
  const dateVenueLine = buildDateVenueLine(event)
  const attributionLine = buildAttributionLine(event)
  const ctaLine = buildFixedCtaLine(event) ?? (draft.cta || null)
  ...
  const copy = [draft.hook, draft.announcement, draft.credibility,
                dateVenueLine, attributionLine, ctaLine, hashtagLine]
```

Order matters: directly after the dates, before the CTA.

## 3. Both SELECT lists

The column must be added to the event query in BOTH routes, or the field
arrives undefined and the feature silently does nothing:

- `app/api/events/stakeholders/announcements/generate/route.ts` (~line 75)
- `app/api/events/stakeholders/announcements/[id]/regenerate-copy/route.ts` (~line 30)

## Scope

- `assembleOrgPromoCopy` only. Not self-promo (a speaker posting in their
  own voice does not carry the organiser's attribution), and not `x_body`
  — 280 characters cannot absorb a 95-character line.
- Legacy-mode events are untouched; this is an assembled-mode field.

## Test

- Event with the column NULL: copy is byte-identical to before.
- Event with it set: the line appears verbatim as its own paragraph
  between the dates and the CTA, and X copy is unchanged.
