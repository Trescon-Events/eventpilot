# Save & Resume across the Toolkit

**Status:** In build — Phase 1 + 2 + 3 shipping in the 02 Jul 2026 session.
**Requested by:** Khalifatur Rahman (Pilot on Website Builder & Brand Studio) via
platform review `fcdbcbff-53e4-43a5-bbce-0c1cfa3aed3b` on 02 Jul 2026.
**Confirmed intent by Durga:** Every tool in the toolkit that has multi-step work
must save-as-draft. When a staff member returns to that tool for the same event,
the tool asks "Resume the saved task, or Start a new one?". A shared **Resume
Work** section in the toolkit sidebar surfaces the user's active drafts so they
can jump back in without navigating manually.

## What we're solving

Today, a staff member starting work in Website Builder for an event has no way
to leave the tool mid-task without losing where they were. When they come back,
they choose the event, open the tool, and start over. Multiply that by every
tool in the toolkit and the friction compounds.

The fix is two things running together:

1. **Every multi-step tool auto-saves as they work.** No explicit save button
   required.
2. **The toolkit surfaces active drafts.** One click resumes them exactly.

## Scope — which tools

**In scope for this rollout (Khalifa's tools)**

| Tool | Rationale |
|---|---|
| Website Builder | Khalifa's primary tool. Long build sessions. Draft/publish concept already partly present via `event_websites`. |
| Brand Studio | Khalifa's second tool. Multi-step brand ingest. Draft concept already partly present via `brand_guidelines`. |

**Roadmap — Tier 1 tools deferred to later phases**

Assess after Website Builder + Brand Studio are proven. Do not build speculatively.

| Tool | Rationale |
|---|---|
| Market Intelligence | AI research queries — multi-step by nature |
| Bespoke Tracker — Brief | Client brief is a structured long-form document |
| AI Course Generator | Generate → review → refine → publish |
| Outreach | Campaign builder: audience → template → schedule |

**Not building save/resume**

Management views and completion-based tools where a draft concept doesn't apply:
Course Manager, HR Portal, Timesheets (already progressive), Finance Portal,
Commercial.

## Architecture

Shared registry, per-tool draft tables.

```
┌───────────────────────────────────────────────────────────────┐
│  active_drafts                (single registry table)         │
│    id · user_id · tool_key · event_id · tool_record_id        │
│    display_label · status_text · last_updated                 │
│    shared_with_team (bool) · notes (text)                     │
└──────────────────────┬────────────────────────────────────────┘
                       │ tool_record_id points at
        ┌──────────────┼──────────────┬───────────────┐
        ▼              ▼              ▼               ▼
   event_websites   brand_guidelines  ...             ...
   (own schema)     (own schema)
```

The registry is a small, uniform table optimised for the "what am I in the
middle of?" query. Each tool keeps its own domain-specific draft table because
website drafts and brand kits have wildly different shapes — forcing them into
a shared JSON blob would be a mistake.

**One active draft per `(user_id, tool_key, event_id)`.** Enforced by a UNIQUE
constraint. Version drafts (like several parallel Website Builder revisions) is
a Phase 2 feature — not built now.

## The shared primitives (Phase 1)

Every tool integrates with three pieces:

1. **`useDraft(toolKey, eventId?)` hook** — pulls the active draft for this
   user/tool/event on mount, exposes `saveDraft(displayLabel, statusText,
   toolRecordId)`, `discardDraft()`, `shareDraft()`.
2. **`<DraftReEntryModal>` component** — renders when a draft exists on mount.
   Options: *Resume this draft* or *Start a new one*. If the draft is shared by
   another user (see below), the modal also indicates the owner.
3. **`<ResumeSidebar>` component** — the new section in `/admin/toolkit`
   sidebar labelled **RESUME WORK**. Reads from `/api/drafts`. Shows the current
   user's personal drafts plus any team drafts explicitly shared with them for
   events they can access.

## Multi-user rules

Trescon works across Dubai + India timezones. The pattern has to accommodate
handoffs without stepping on each other's work.

- **Default: personal drafts.** Khalifa's draft is Khalifa's. Prashant opening
  the same tool/event doesn't see her draft — he starts fresh.
- **Opt-in share:** Khalifa can toggle "Share with team" on her own draft.
  Once shared, teammates with access to that tool+event see it in their sidebar
  and can pick it up. This is the handoff mechanism.
- **Concurrent-edit signal:** When two users edit a shared draft simultaneously,
  the second user gets a soft banner ("Prashant edited this 2 minutes ago").
  Last-write-wins on save. Not full conflict resolution — the audience is a
  small trusted team; hard locking would create more friction than the edge
  case it prevents.
- **Approval / handoff request UI: NOT in scope.** If someone needs a personal
  draft that isn't shared, they message the owner via existing channels. Ship
  the primitive; add ceremony later if usage demands it.

## Rollout phases

| Phase | Scope | Status this session |
|---|---|---|
| **1** | Foundation: `active_drafts` table + `/api/drafts` endpoints + `useDraft` hook + `<DraftReEntryModal>` + `<ResumeSidebar>` + toolkit sidebar wire-up. Zero tool integration. | 🛠 building |
| **2** | Wire **Website Builder** — Khalifa's primary tool. First real proof. | 🛠 building |
| **3** | Wire **Brand Studio** — Khalifa's second tool. | 🛠 building |
| **4** | Wire **Bespoke Brief** — Nicholas's tool. Explicit backlog. | Deferred |
| **5** | Wire **Market Intelligence** + **Outreach** + **AI Course Generator** | Deferred |
| **Later** | Share/handoff approvals, version drafts, tracker view of team drafts | Deferred |

## Trade-offs / open items

- **Draft storage size.** Website drafts and brand kits can be large (images,
  JSON blobs). Each tool's own draft table handles this appropriately; the
  registry only holds pointers + light metadata.
- **Auto-cleanup policy.** Drafts left untouched for 30+ days should probably
  archive automatically. Not built in Phase 1 — noted here so it doesn't get
  lost. Add when the registry starts accumulating stale rows.
- **What counts as "active"?** For now: any row in `active_drafts`. When a tool
  publishes/completes, it explicitly deletes the corresponding `active_drafts`
  row. Each tool is responsible for this cleanup.
- **What tool_key values do we use?** Underscored, matches the existing
  convention in `feature_activity` and `TOOL_GRANT_KEY`:
  `website_builder`, `brand_studio`, `market_intelligence`, `bespoke_brief`,
  `outreach`, `ai_course_gen`.

## Success looks like

Khalifa opens the toolkit tomorrow morning. In her sidebar, below EVENT TOOLS,
she sees:

```
RESUME WORK
────────────
World AI Show Indonesia
Website Builder — draft, 3h ago

FinTech Summit Dubai
Brand Studio — brand extraction, 1d ago
```

She clicks the first. She lands directly in Website Builder for World AI Show
Indonesia, and a modal asks "Resume your draft (3 hours ago), or Start a new
one?". She resumes. She's back exactly where she left off.

That's the whole promise. Everything else in this document exists to make that
sentence true across every tool that matters.
