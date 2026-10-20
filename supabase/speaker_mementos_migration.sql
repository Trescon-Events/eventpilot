-- Speaker memento photo hand-off, step 1 (2026-10-20, Madhu): the producer shares speakers' Cleaned Photos with Ops in batches, so a
-- memento vendor can make speaker mementos. Step 1 = batches + per-speaker tracking + a "shared before EventPilot" list.
-- Step 2 (later) = Ops notified, Ops page, vendor portal download + confirm.
-- A batch freezes WHICH photo each speaker had when it was shared (photo_url), so a later re-clean shows "photo changed since shared".
-- kind 'legacy' = speakers whose photos were shared with Ops before EventPilot (no photo snapshot); shared_at is the date the producers give.
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS memento_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  note        TEXT,
  kind        TEXT NOT NULL DEFAULT 'shared' CHECK (kind IN ('shared', 'legacy')),
  shared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memento_batches_event ON memento_batches(event_id, shared_at DESC);

CREATE TABLE IF NOT EXISTS memento_batch_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL REFERENCES memento_batches(id) ON DELETE CASCADE,
  speaker_id    UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  speaker_name  TEXT NOT NULL,
  photo_url     TEXT,                    -- the Cleaned Photo as it was when shared; NULL for a legacy batch
  CONSTRAINT memento_batch_items_unique UNIQUE (batch_id, speaker_id)
);
CREATE INDEX IF NOT EXISTS idx_memento_items_speaker ON memento_batch_items(speaker_id);

COMMIT;
