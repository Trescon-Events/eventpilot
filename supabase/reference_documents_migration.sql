-- Reference Documents & Content Validation — Stage 1: document model
-- (2026-09-10). See docs/build_suggestions/reference-documents-and-validation.md
-- for the full spec. Adds role/authority_rank/provenance to
-- event_messaging_docs so a single event's effective document set can hold
-- more than one governing document (style guide, messaging reference,
-- Trescon production pack) at different authority levels, instead of the
-- current one-doc-per-event assumption. Backfill preserves identical
-- behavior for every existing event (all become role='messaging',
-- authority_rank=1) — this is a strict non-negotiable of the spec.

-- role: which kind of document this is. Default 'messaging' matches every
-- existing row's actual role today.
ALTER TABLE event_messaging_docs ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'messaging';
ALTER TABLE event_messaging_docs ADD CONSTRAINT event_messaging_docs_role_check
  CHECK (role IN ('style_guide', 'messaging', 'production_pack'));

-- authority_rank: lower wins on a rule conflict. Independent of whether the
-- doc is attached at umbrella or event level — a producer sets it
-- explicitly when uploading a second/third governing document. Default 1
-- is correct for every event with only one document (the common case).
ALTER TABLE event_messaging_docs ADD COLUMN IF NOT EXISTS authority_rank INTEGER NOT NULL DEFAULT 1;

-- provenance: whether this document's content is DIFC/client-approved
-- verbatim, or Trescon-authored (derived, not independently client-signed).
-- Computed at insert time by the app (see the POST handler in
-- app/api/events/stakeholders/messaging/route.ts) using this rule:
--   role = 'production_pack'      -> always trescon_authored
--   events.type = 'managed'       -> client_approved (has a real external client)
--   otherwise (signature/bespoke) -> trescon_authored (Trescon-owned, no external approver)
-- Overridable by the producer afterward (PATCH .../messaging/[id]).
-- Added nullable first so the backfill below can compute it per-row, then
-- locked to NOT NULL.
ALTER TABLE event_messaging_docs ADD COLUMN IF NOT EXISTS provenance TEXT;

UPDATE event_messaging_docs d
SET provenance = CASE
  WHEN d.role = 'production_pack' THEN 'trescon_authored'
  WHEN e.type = 'managed'         THEN 'client_approved'
  ELSE 'trescon_authored'
END
FROM events e
WHERE e.id = d.event_id AND d.provenance IS NULL;

ALTER TABLE event_messaging_docs ALTER COLUMN provenance SET NOT NULL;
ALTER TABLE event_messaging_docs ADD CONSTRAINT event_messaging_docs_provenance_check
  CHECK (provenance IN ('client_approved', 'trescon_authored'));

-- Live-doc uniqueness moves from "one per event" (previously enforced only
-- in application code — approve/route.ts's supersede step) to "one per
-- (event, role)" — enforced here at the DB level so a bug can never leave
-- two live docs of the same role on one event.
CREATE UNIQUE INDEX IF NOT EXISTS event_messaging_docs_live_per_role
  ON event_messaging_docs (event_id, role) WHERE status = 'live';

CREATE INDEX IF NOT EXISTS idx_messaging_docs_event_role ON event_messaging_docs (event_id, role, status);
