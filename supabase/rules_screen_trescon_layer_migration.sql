-- Content setup: rules screen and the Trescon-wide layer (2026-10-15) — see
-- docs/build_suggestions/rules-screen-and-trescon-layer.md. One transaction.
--
-- Nothing here edits a reference document, and no rule's pattern/severity/message changes. The ONE data move is
-- trescon-no-announce-filler (DFFW umbrella -> Trescon-wide); DFFW children still get it through the Trescon-wide layer.
begin;

-- ── 1. A Trescon-wide owner ───────────────────────────────────────────────
ALTER TABLE event_validation_rules ADD COLUMN IF NOT EXISTS org_scope TEXT CHECK (org_scope IN ('trescon'));
ALTER TABLE event_messaging_docs   ADD COLUMN IF NOT EXISTS org_scope TEXT CHECK (org_scope IN ('trescon'));

ALTER TABLE event_validation_rules DROP CONSTRAINT IF EXISTS event_validation_rules_owner_check;
ALTER TABLE event_validation_rules ADD CONSTRAINT event_validation_rules_owner_check
  CHECK (num_nonnulls(event_id, umbrella_id, org_scope) = 1);
ALTER TABLE event_messaging_docs DROP CONSTRAINT IF EXISTS event_messaging_docs_owner_check;
ALTER TABLE event_messaging_docs ADD CONSTRAINT event_messaging_docs_owner_check
  CHECK (num_nonnulls(event_id, umbrella_id, org_scope) = 1);

-- Same per-owner partial-index pattern as the event/umbrella ones (NULLs never collide in a shared index).
-- The per-edit audit table for documents takes the same third owner.
ALTER TABLE event_messaging_doc_edits ADD COLUMN IF NOT EXISTS org_scope TEXT CHECK (org_scope IN ('trescon'));
ALTER TABLE event_messaging_doc_edits DROP CONSTRAINT IF EXISTS event_messaging_doc_edits_owner_check;
ALTER TABLE event_messaging_doc_edits ADD CONSTRAINT event_messaging_doc_edits_owner_check
  CHECK (num_nonnulls(event_id, umbrella_id, org_scope) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS event_validation_rules_org_rule_key
  ON event_validation_rules (org_scope, rule_key) WHERE org_scope IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_messaging_docs_live_per_role_org
  ON event_messaging_docs (org_scope, role) WHERE status = 'live' AND org_scope IS NOT NULL;

-- ── 2. Rule origin ────────────────────────────────────────────────────────
-- Added nullable, backfilled in section 3, then made NOT NULL. DEFAULT 'client' stays so the older insert paths (seed SQL,
-- clarification-suggested rules) keep working; the rules screen always sets it explicitly.
ALTER TABLE event_validation_rules ADD COLUMN IF NOT EXISTS origin TEXT CHECK (origin IN ('client', 'trescon'));

-- ── 3. BACKFILL (shown to Madhu before this file is run) ──────────────────
-- difc-*  (DFFW umbrella, DIFC style guide)        -> client
-- bss-*   (BSS, KSDC-approved document)             -> client
-- accepted suggested rules (clarification-*, or any row that came through the suggested-rules flow) -> client
-- ain-*   (AI InfraNext: flagship, no client, Trescon-authored docs) -> trescon
-- trescon-* (the DFFW umbrella's Trescon production-pack rules)      -> trescon
UPDATE event_validation_rules SET origin = 'client'
 WHERE origin IS NULL AND (rule_key LIKE 'difc-%' OR rule_key LIKE 'bss-%' OR rule_key LIKE 'clarification-%' OR source_clarification_id IS NOT NULL);
UPDATE event_validation_rules SET origin = 'trescon'
 WHERE origin IS NULL AND (rule_key LIKE 'ain-%' OR rule_key LIKE 'trescon-%');

-- Move the house rule up to the Trescon-wide layer. Pattern, severity and message are NOT touched.
UPDATE event_validation_rules SET umbrella_id = NULL, event_id = NULL, org_scope = 'trescon', origin = 'trescon'
 WHERE rule_key = 'trescon-no-announce-filler' AND umbrella_id = 'd4c7c680-2618-4159-bfa6-5bcd0701ca22' AND org_scope IS NULL;

-- Anything still unclassified is an unexpected rule: stop rather than guess.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM event_validation_rules WHERE origin IS NULL) THEN
    RAISE EXCEPTION 'Unclassified rules remain: %', (SELECT string_agg(rule_key, ', ') FROM event_validation_rules WHERE origin IS NULL);
  END IF;
END $$;
ALTER TABLE event_validation_rules ALTER COLUMN origin SET DEFAULT 'client';
ALTER TABLE event_validation_rules ALTER COLUMN origin SET NOT NULL;

-- ── 4. Inherited-rule override ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_rule_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  rule_key    TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT true,
  reason      TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_rule_overrides_owner_check CHECK (num_nonnulls(event_id, umbrella_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS event_rule_overrides_event_key    ON event_rule_overrides (event_id, rule_key)    WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_rule_overrides_umbrella_key ON event_rule_overrides (umbrella_id, rule_key) WHERE umbrella_id IS NOT NULL;

-- ── 5. Audit ──────────────────────────────────────────────────────────────
-- rule_id has no FK on purpose: the row must outlive a deleted rule. `owner` is 'event:<id>' | 'umbrella:<id>' | 'org:trescon'.
CREATE TABLE IF NOT EXISTS validation_rule_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id    UUID,
  rule_key   TEXT NOT NULL,
  owner      TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('create', 'update', 'disable', 'enable', 'delete')),
  before     JSONB,
  after      JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_validation_rule_changes_rule  ON validation_rule_changes (rule_id);
CREATE INDEX IF NOT EXISTS idx_validation_rule_changes_owner ON validation_rule_changes (owner, changed_at DESC);

INSERT INTO validation_rule_changes (rule_id, rule_key, owner, action, before, after, changed_by)
SELECT id, rule_key, 'org:trescon', 'update',
       jsonb_build_object('owner', 'umbrella:d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'origin', 'trescon'),
       jsonb_build_object('owner', 'org:trescon', 'origin', 'trescon'),
       NULL
  FROM event_validation_rules WHERE rule_key = 'trescon-no-announce-filler' AND org_scope = 'trescon';

commit;
