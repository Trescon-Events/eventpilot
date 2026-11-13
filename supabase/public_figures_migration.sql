-- Public figures (docs/build_suggestions/public-figures.md, 13 Nov 2026): approved post-event stats and facts for every public document.
--
-- PUBLIC ONLY. Internal actuals and targets are not kept here and, when they are built, get their own tables and tab (spec §3.1).
-- Every table is new; nothing existing is changed, so no event's output changes until an event has approved figures.
--
--  * event_public_figures          one row per item (figure / breakdown / outcome). Tools read ONLY approved_payload of an active item.
--  * event_public_figure_versions  every approval, with the route it came by.
--  * event_public_figure_reviews   one row per review round sent (internal colleagues or the client), reached through a token link.
--  * event_public_figure_decisions one row per item per round (approve / reject / suggest).
--  * event_public_figure_usages    which tool read which version (live = follows updates, sent = a record only).
--  * event_public_figure_changes   audit of every write: who, when, before, after, reason.
--
-- Evidence files live in the private DocuHub R2 bucket under public-figures/<event_id>/<figure_id>/<filename>; only the path is stored here.
-- Run by hand through the direct psql session-pooler connection. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS event_public_figures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('figure', 'breakdown', 'outcome')),
  catalogue_key      TEXT,
  category           TEXT NOT NULL,
  group_label        TEXT,
  label              TEXT NOT NULL,
  working_payload    JSONB NOT NULL DEFAULT '{}',
  approved_payload   JSONB,
  approved_label     TEXT,
  approved_version   INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_internal_review', 'pending_client', 'client_suggested', 'client_rejected', 'approved', 'edited_since_approval')),
  source             TEXT,
  evidence_file_path TEXT,
  evidence_file_name TEXT,
  basis              TEXT NOT NULL DEFAULT 'measured' CHECK (basis IN ('measured', 'estimate')),
  owner_id           UUID,
  notes              TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- one label per group per event (case-insensitive); removed items keep their row, so they are excluded from the rule
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_public_figures_label ON event_public_figures (event_id, COALESCE(group_label, ''), LOWER(label)) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_event_public_figures_event ON event_public_figures (event_id, is_active);

CREATE TABLE IF NOT EXISTS event_public_figure_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  figure_id      UUID NOT NULL REFERENCES event_public_figures(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  label          TEXT NOT NULL,
  payload        JSONB NOT NULL,
  approved_by    UUID,
  approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approval_route TEXT NOT NULL CHECK (approval_route IN ('internal', 'client', 'client_suggestion_accepted')),
  UNIQUE (figure_id, version)
);

CREATE TABLE IF NOT EXISTS event_public_figure_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  audience       TEXT NOT NULL CHECK (audience IN ('internal', 'client')),
  review_token   TEXT NOT NULL UNIQUE,
  item_ids       UUID[] NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  sent_by        UUID,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at      TIMESTAMPTZ,
  reviewer_name  TEXT,
  reviewer_email TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_public_figure_reviews_event ON event_public_figure_reviews (event_id);

CREATE TABLE IF NOT EXISTS event_public_figure_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         UUID NOT NULL REFERENCES event_public_figure_reviews(id) ON DELETE CASCADE,
  figure_id         UUID NOT NULL REFERENCES event_public_figures(id) ON DELETE CASCADE,
  decision          TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'suggest')),
  suggested_label   TEXT,
  suggested_payload JSONB,
  comment           TEXT,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  UNIQUE (review_id, figure_id)
);

CREATE TABLE IF NOT EXISTS event_public_figure_usages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  figure_id     UUID NOT NULL REFERENCES event_public_figures(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  consumer_type TEXT NOT NULL,
  consumer_id   TEXT,
  mode          TEXT NOT NULL CHECK (mode IN ('live', 'sent')),
  used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_public_figure_usages_figure ON event_public_figure_usages (figure_id);

CREATE TABLE IF NOT EXISTS event_public_figure_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID,
  figure_id  UUID,
  action     TEXT NOT NULL,
  before     JSONB,
  after      JSONB,
  reason     TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_public_figure_changes_event ON event_public_figure_changes (event_id, changed_at DESC);

-- Row level security: the app reads and writes through the service role only (same as the Copy Library tables).
ALTER TABLE event_public_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_public_figure_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_public_figure_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_public_figure_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_public_figure_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_public_figure_changes ENABLE ROW LEVEL SECURITY;

COMMIT;
