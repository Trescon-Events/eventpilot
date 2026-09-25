-- Operations Hub, Phase 2: licence batches + access audit (2026-09-24)
--
-- Speaker licence procurement (UAE govt requirement — one licence document
-- lists many speakers). Ops groups "ready" speakers (every required
-- Passport/National ID reviewed by a producer) into batches for the licence
-- vendor. Phase 2 builds Draft batches only; sending to the vendor, the
-- vendor portal, downloads and licence upload arrive in Phase 3, so the
-- status set and timestamp columns below already cover the full lifecycle.
--
-- "Applied for licence" is deliberately NOT a separate flag: a speaker is
-- "applied" exactly when they sit in an active (non-cancelled) batch that
-- has been sent. One less thing to keep in sync.
--
-- Run manually via the Supabase session-pooler psql connection — this repo
-- has no migration runner, all files under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_license_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES ops_vendors(id) ON DELETE RESTRICT,
  -- Human-facing, per-event sequence ("Batch 3"). UNIQUE so two ops people
  -- creating a batch at once can't get the same number (the API retries).
  batch_number    INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','downloaded','completed','expired','cancelled')),
  -- How long the vendor has access once the batch is SENT. Ops-editable,
  -- hard cap 30 days (Madhu, 2026-09-24). expires_at is stamped at send.
  access_days     INT NOT NULL DEFAULT 7 CHECK (access_days BETWEEN 1 AND 30),
  notes           TEXT,
  sent_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  downloaded_at   TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  -- How the vendor (or ops on their behalf) closed the batch: a licence
  -- copy was uploaded, or the vendor only confirmed it was approved. The
  -- real ops process is not settled yet, so both are supported.
  completion_type TEXT CHECK (completion_type IN ('license_uploaded','approved')),
  created_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_ops_license_batches_event ON ops_license_batches(event_id);
CREATE INDEX IF NOT EXISTS idx_ops_license_batches_vendor ON ops_license_batches(vendor_id);

-- One row per speaker in a batch, FROZEN at creation: the display fields
-- and the exact document rows included. If a producer later replaces a
-- passport (a new row, unreviewed) or the speaker is cancelled, the batch
-- keeps what was actually sent; the app flags "changed since batch".
CREATE TABLE IF NOT EXISTS ops_license_batch_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id               UUID NOT NULL REFERENCES ops_license_batches(id) ON DELETE CASCADE,
  speaker_id             UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  -- Cleared to false when the batch is cancelled, releasing the speaker
  -- to be batched again.
  active                 BOOLEAN NOT NULL DEFAULT true,
  speaker_name           TEXT NOT NULL,
  job_title              TEXT,
  company                TEXT,
  country                TEXT,
  is_uae_resident        BOOLEAN NOT NULL,
  passport_doc_id        UUID NOT NULL REFERENCES speaker_sensitive_documents(id) ON DELETE RESTRICT,
  national_id_doc_id     UUID REFERENCES speaker_sensitive_documents(id) ON DELETE RESTRICT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, speaker_id)
);
-- A speaker can be in at most ONE active batch at a time — enforced by the
-- database so concurrent batch creation can't double-book them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_batch_items_speaker_active
  ON ops_license_batch_items (speaker_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_ops_batch_items_batch ON ops_license_batch_items(batch_id);

-- Append-only record of who viewed/downloaded what. Staff document
-- previews are logged from Phase 2; vendor-portal views/downloads use the
-- same table in Phase 3 (actor_type 'vendor'). actor_id is TEXT so it can
-- hold a staff_members.id or, later, an ops_vendor_users.id without an FK
-- to either — the log must outlive both.
CREATE TABLE IF NOT EXISTS ops_access_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE SET NULL,
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('staff','vendor','system')),
  actor_id     TEXT,
  action       TEXT NOT NULL,            -- e.g. 'document_preview', 'batch_created'
  target_type  TEXT,
  target_id    TEXT,
  meta         JSONB,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_access_audit_event ON ops_access_audit(event_id, created_at DESC);

COMMIT;
