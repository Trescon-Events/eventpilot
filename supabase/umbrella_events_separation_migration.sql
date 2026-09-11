-- Umbrella/event structural separation (2026-09-11) — agreed with Madhu:
-- Staff Portal treats "umbrella_events" and "projects" as genuinely
-- separate tables (confirmed live on their side), and EventPilot should
-- match that now rather than at the eventual full Staff-Portal-into-
-- EventPilot merge, when the same rework would be forced under real time
-- pressure with far more built on top of the flat model. This replaces
-- events.parent_event_id (an umbrella modeled as just another events row)
-- with a real event_umbrellas table and events.umbrella_id.
--
-- Run this file top to bottom, in order — later statements assume earlier
-- ones already ran. Data migration (steps 3-5) is idempotent (WHERE
-- clauses guard against re-running), but take a moment before running
-- against production: step 6 deletes the old umbrella's `events` row.

-- ── 1. New table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_umbrellas (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  client_name               TEXT,
  status                    TEXT NOT NULL DEFAULT 'planning',
  event_date                DATE,
  end_date                  DATE,
  description               TEXT,
  -- type: nullable, unused until Staff Portal actually sends one for
  -- umbrellas too (Madhu, 2026-09-10: "I will now update staff portal for
  -- this also... so there will be a type for that also similar to
  -- Events"). Added now so no second migration is needed once it exists.
  type                      TEXT,
  staff_portal_umbrella_id  UUID UNIQUE,
  requires_client_approval  BOOLEAN,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. events.umbrella_id replaces events.parent_event_id ──────────────
-- parent_event_id is left in place (not dropped) until the very end of
-- this migration, as a rollback safety net — see the final DROP at the
-- bottom, commented out on purpose.
ALTER TABLE events ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_umbrella_id ON events(umbrella_id) WHERE umbrella_id IS NOT NULL;

-- ── 3. Move the umbrella's own data — SAME id, new table ───────────────
-- Reusing the same UUID (rather than generating a new one) means every
-- existing events.parent_event_id value that pointed at it is already the
-- correct event_umbrellas.id — no id remapping needed anywhere else.
INSERT INTO event_umbrellas (id, name, client_name, status, event_date, end_date, description, type, staff_portal_umbrella_id, requires_client_approval, created_at, updated_at)
SELECT id, name, client_name, status, event_date, end_date, description, type, staff_portal_umbrella_id, requires_client_approval, created_at, updated_at
FROM events
WHERE staff_portal_umbrella_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ── 4. Repoint children ─────────────────────────────────────────────────
UPDATE events SET umbrella_id = parent_event_id
WHERE parent_event_id IS NOT NULL
  AND parent_event_id IN (SELECT id FROM event_umbrellas)
  AND umbrella_id IS NULL;

-- ── 5. Dual ownership on the two tables a producer/CMD explicitly
-- attaches content to at either level (messaging docs, validation rules).
-- event_compiled_reference and event_messaging_doc_clarifications
-- deliberately do NOT need this: a compiled reference is only ever
-- materialised per real event (an umbrella's own live docs are already
-- included via the resolver when a CHILD compiles, so there's nothing to
-- read by compiling the umbrella "itself"), and clarifications key off
-- doc_id, inheriting whichever owner that doc has.
ALTER TABLE event_messaging_docs ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE;
ALTER TABLE event_messaging_docs ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE event_messaging_docs ADD CONSTRAINT event_messaging_docs_owner_check
  CHECK ((event_id IS NOT NULL) <> (umbrella_id IS NOT NULL));
-- Replaces the Stage 1 partial index (event_id, role) WHERE status='live'
-- with an owner-aware pair — a plain (event_id, role) index would let
-- NULL event_id rows (every umbrella-owned doc) collide silently, since
-- Postgres never treats two NULLs as equal for uniqueness.
DROP INDEX IF EXISTS event_messaging_docs_live_per_role;
CREATE UNIQUE INDEX IF NOT EXISTS event_messaging_docs_live_per_role_event
  ON event_messaging_docs (event_id, role) WHERE status = 'live' AND event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_messaging_docs_live_per_role_umbrella
  ON event_messaging_docs (umbrella_id, role) WHERE status = 'live' AND umbrella_id IS NOT NULL;

ALTER TABLE event_validation_rules ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE;
ALTER TABLE event_validation_rules ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE event_validation_rules ADD CONSTRAINT event_validation_rules_owner_check
  CHECK ((event_id IS NOT NULL) <> (umbrella_id IS NOT NULL));
-- Same NULL-uniqueness problem as above — the original UNIQUE (event_id,
-- rule_key) would let every umbrella-owned rule_key collide silently.
ALTER TABLE event_validation_rules DROP CONSTRAINT IF EXISTS event_validation_rules_event_id_rule_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS event_validation_rules_event_rule_key
  ON event_validation_rules (event_id, rule_key) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_validation_rules_umbrella_rule_key
  ON event_validation_rules (umbrella_id, rule_key) WHERE umbrella_id IS NOT NULL;

-- Move the 24 DFFW seed rules (Stage 3) from event_id to umbrella_id — the
-- only rows currently attached to an id that's about to stop existing in
-- `events` (step 6 below).
UPDATE event_validation_rules SET umbrella_id = event_id, event_id = NULL
WHERE event_id IN (SELECT id FROM event_umbrellas);

-- ── 6. Delete the old events row(s) for the umbrella(s) — the data now
-- lives in event_umbrellas under the same id, and every FK that pointed
-- at it (events.umbrella_id, event_validation_rules.umbrella_id) has
-- already been repointed above.
DELETE FROM events WHERE id IN (SELECT id FROM event_umbrellas);

-- ── 7. Drop parent_event_id — run only after verifying the application
-- code no longer reads it (see resolve-reference-docs.ts and friends) and
-- that events.umbrella_id/event_umbrellas look correct. Done 2026-09-11
-- after full live verification (umbrella upload -> approve -> child
-- recompile -> validation rule inheritance -> client-approval gating, all
-- re-tested against both real DFFW data and disposable test data).
ALTER TABLE events DROP COLUMN IF EXISTS parent_event_id;
