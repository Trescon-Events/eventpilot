-- Speaker mementos (2026-10-20, Madhu): modelled on the Badges module — create a batch (name + speakers), then "Push to Ops".
-- A batch is a draft until pushed; a pushed batch is locked. Speakers in a pushed batch show "Pushed to Ops".
-- Batches recorded before this status existed (and "shared before EventPilot" batches) count as already pushed.
-- Additive only.

BEGIN;

ALTER TABLE memento_batches ADD COLUMN IF NOT EXISTS status    TEXT NOT NULL DEFAULT 'pushed' CHECK (status IN ('draft', 'pushed'));
ALTER TABLE memento_batches ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;
ALTER TABLE memento_batches ADD COLUMN IF NOT EXISTS pushed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
UPDATE memento_batches SET pushed_at = shared_at WHERE status = 'pushed' AND pushed_at IS NULL;

COMMIT;
