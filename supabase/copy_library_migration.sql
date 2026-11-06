-- Copy Library + Style notes (docs/build_suggestions/copy-library.md §3, §7). Additive, one transaction, safe to re-run.
-- Nothing here changes any existing row's behaviour: events get two new columns (content_phase default 'pre', copy_requires_client_approval NULL = "managed events only").
begin;

ALTER TABLE events ADD COLUMN IF NOT EXISTS content_phase TEXT NOT NULL DEFAULT 'pre' CHECK (content_phase IN ('pre','post'));
-- NULL means the default: required for managed events, not for others (resolved in code so new events need no backfill).
ALTER TABLE events ADD COLUMN IF NOT EXISTS copy_requires_client_approval BOOLEAN;

CREATE TABLE IF NOT EXISTS copy_library_bundles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID REFERENCES events(id) ON DELETE CASCADE,
  umbrella_id    UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  org_scope      TEXT CHECK (org_scope IN ('trescon')),
  item_ids       UUID[] NOT NULL,
  status         TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','approved','changes_requested')),
  review_token   TEXT NOT NULL UNIQUE,
  sent_by        UUID,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  client_comment TEXT,
  CONSTRAINT copy_library_bundles_owner_check CHECK (num_nonnulls(event_id, umbrella_id, org_scope) = 1)
);

CREATE TABLE IF NOT EXISTS copy_library_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID REFERENCES events(id) ON DELETE CASCADE,
  umbrella_id      UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  org_scope        TEXT CHECK (org_scope IN ('trescon')),
  asset_key        TEXT NOT NULL,
  variant_length   TEXT NOT NULL CHECK (variant_length IN ('one_liner','short','medium','long','x','n/a')),
  variant_phase    TEXT NOT NULL CHECK (variant_phase IN ('pre','post','any')),
  working_text     TEXT NOT NULL DEFAULT '',
  approved_text    TEXT,
  approved_version INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_internal_review','pending_client','approved','needs_review','edited_since_approval')),
  source           TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','manual','from_doc')),
  source_refs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_by      UUID,
  approved_at      TIMESTAMPTZ,
  client_bundle_id UUID REFERENCES copy_library_bundles(id) ON DELETE SET NULL,
  review_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT copy_library_items_owner_check CHECK (num_nonnulls(event_id, umbrella_id, org_scope) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS copy_library_items_event_key   ON copy_library_items (event_id, asset_key, variant_length, variant_phase)    WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS copy_library_items_umbrella_key ON copy_library_items (umbrella_id, asset_key, variant_length, variant_phase) WHERE umbrella_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS copy_library_items_org_key      ON copy_library_items (org_scope, asset_key, variant_length, variant_phase)   WHERE org_scope IS NOT NULL;

CREATE TABLE IF NOT EXISTS copy_library_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES copy_library_items(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  text        TEXT NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, version)
);

CREATE TABLE IF NOT EXISTS copy_library_usages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES copy_library_items(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  consumer_type TEXT NOT NULL,
  consumer_id   TEXT,
  mode          TEXT NOT NULL CHECK (mode IN ('live','sent')),
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS copy_library_usages_item ON copy_library_usages (item_id);

-- Audit: who, when, before, after (§2.7), same shape as validation_rule_changes.
CREATE TABLE IF NOT EXISTS copy_library_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID,
  owner      TEXT NOT NULL,
  asset_key  TEXT,
  action     TEXT NOT NULL,
  before     JSONB,
  after      JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS copy_library_changes_owner ON copy_library_changes (owner, changed_at DESC);

-- §7 Style notes: non-checkable writing guidance and event-level overrides, shown in the Rules screen.
CREATE TABLE IF NOT EXISTS style_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  org_scope   TEXT CHECK (org_scope IN ('trescon')),
  note        TEXT NOT NULL CHECK (length(btrim(note)) > 0),
  category    TEXT,
  origin      TEXT NOT NULL DEFAULT 'trescon' CHECK (origin IN ('client','trescon')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT style_notes_owner_check CHECK (num_nonnulls(event_id, umbrella_id, org_scope) = 1)
);
CREATE TABLE IF NOT EXISTS style_note_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    UUID,
  owner      TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('create','update','disable','enable')),
  before     JSONB,
  after      JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

commit;
