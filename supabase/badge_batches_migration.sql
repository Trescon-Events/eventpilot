-- Speaker Badge batches (2026-10-02, Madhu): bulk-create PVC speaker badges for an event's confirmed speakers,
-- review them, approve, then build ONE print PDF (instruction page, one badge per page, common back last).
--
-- A batch freezes (a) the template variant it was made from and (b) each speaker's badge fields at creation time, so a
-- later template edit or speaker-record edit can't silently change an approved batch. "Refresh from speaker records" /
-- "Update template" re-snapshot while the batch is still draft/review. Additive only — no existing table is touched.
-- Print PDFs live in private R2 (not these tables); pdf_versions holds their keys.

BEGIN;

CREATE TABLE IF NOT EXISTS badge_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  variant_id        TEXT NOT NULL,                          -- id of the badge variant inside events.creative_template_config.speaker.variants
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
  template_snapshot JSONB NOT NULL,                         -- the Variant JSON frozen at creation / last "Update template"
  pdf_versions      JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ key, generated_at, generated_by, badges }]
  created_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_badge_batches_event ON badge_batches(event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS badge_batch_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       UUID NOT NULL REFERENCES badge_batches(id) ON DELETE CASCADE,
  speaker_id     UUID REFERENCES event_speakers(id) ON DELETE SET NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  -- frozen speaker fields
  name           TEXT,
  title          TEXT,
  company        TEXT,
  country        TEXT,
  photo_url      TEXT,
  photo_head_box JSONB,
  -- producer adjustments: { name?, title?, company?, country?, photo?: { dx, dy, zoom } }
  overrides      JSONB NOT NULL DEFAULT '{}'::jsonb,
  flags          JSONB NOT NULL DEFAULT '[]'::jsonb,        -- computed at render: [{ code, message }]
  approved       BOOLEAN NOT NULL DEFAULT false,
  removed        BOOLEAN NOT NULL DEFAULT false,
  preview_url    TEXT,
  preview_stale  BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_badge_batch_items_batch ON badge_batch_items(batch_id, position);

CREATE TABLE IF NOT EXISTS badge_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       UUID NOT NULL REFERENCES badge_batches(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('render', 'pdf')),
  status         TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  progress_done  INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT,
  result         JSONB,
  created_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),   -- bumped per item; a 'processing' row not touched for ~3 min is treated as dead
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_badge_jobs_batch ON badge_jobs(batch_id, created_at DESC);

COMMIT;
