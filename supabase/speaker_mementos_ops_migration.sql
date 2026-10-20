-- Speaker mementos, Ops hand-off (2026-10-20, Madhu): producer pushes a batch to Ops -> Ops sends it to the memento vendor ->
-- the vendor downloads the Cleaned Photos from the portal and confirms they look good (or reports a problem) -> Ops told.
-- Same shape as badge_print_dispatches. One row per hand-off of a batch; at most one active hand-off per batch.
-- status: requested (with Ops) | sent (with the vendor) | downloaded | confirmed (vendor: all good) | issue (vendor reported a problem) | revoked
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS memento_dispatches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             UUID NOT NULL REFERENCES memento_batches(id) ON DELETE CASCADE,
  speakers             INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'sent', 'downloaded', 'confirmed', 'issue', 'revoked')),
  requested_by         UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_note         TEXT,
  vendor_id            UUID REFERENCES ops_vendors(id) ON DELETE SET NULL,
  sent_by              UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_at              TIMESTAMPTZ,
  first_downloaded_at  TIMESTAMPTZ,
  last_downloaded_at   TIMESTAMPTZ,
  download_count       INTEGER NOT NULL DEFAULT 0,
  vendor_response_at   TIMESTAMPTZ,                  -- when the vendor confirmed or reported a problem
  vendor_response_by   UUID REFERENCES ops_vendor_users(id) ON DELETE SET NULL,
  vendor_note          TEXT,
  revoked_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  revoked_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_memento_dispatches_batch ON memento_dispatches(batch_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_memento_dispatches_vendor ON memento_dispatches(vendor_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memento_dispatches_one_active
  ON memento_dispatches(batch_id) WHERE status IN ('requested', 'sent', 'downloaded', 'issue');

COMMIT;
