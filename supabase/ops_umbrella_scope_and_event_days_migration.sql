-- Operations Hub: umbrella-level licence processing + real "Event days" dates (2026-09-25)
--
-- 1) EVENT DAYS. events.event_date / end_date are the whole event CYCLE (e.g.
--    Dubai FinTech Summit: 1 Oct 2025 -> 30 Nov 2026), not the real event days,
--    and the real days exist only as free text (events.public_dates_display,
--    kept as text on purpose for public copy). Passport/ID retention ("30 days
--    after the event") therefore needs proper DATE columns: actual_start_date /
--    actual_end_date on events AND on event_umbrellas (the DFFW week itself).
--    NULL = not set yet; the app then falls back to the old cycle end_date.
--
-- 2) UMBRELLA-LEVEL OWNERSHIP. Licences for every DFFW event are processed at the
--    DFFW umbrella level, not per event. The ops_* tables keyed on event_id
--    (which has an FK to events, so an umbrella id can't go there) get the same
--    dual ownership the reference-documents tables already use: exactly ONE of
--    event_id / umbrella_id is set. Existing event_id-based unique constraints
--    are KEPT (NULL event_id rows never collide), so the code that is live today
--    keeps working while this is applied.
--
-- Vendors assigned to a child event of an umbrella (the "TEST VENDOR" on Dubai
-- FinTech Summit) are moved to the umbrella here. Batches/licence files of
-- umbrella children are NOT migrated — the guard below aborts if any exist,
-- rather than silently mangling per-event batch numbering.
--
-- Run manually via the Supabase session-pooler psql connection — this repo has
-- no migration runner, all files under supabase/ are applied by hand.

BEGIN;

-- ── 1. Event days ───────────────────────────────────────────────────────────
ALTER TABLE events         ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE events         ADD COLUMN IF NOT EXISTS actual_end_date   DATE;
ALTER TABLE event_umbrellas ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE event_umbrellas ADD COLUMN IF NOT EXISTS actual_end_date   DATE;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_actual_days_order;
ALTER TABLE events ADD CONSTRAINT events_actual_days_order
  CHECK (actual_start_date IS NULL OR actual_end_date IS NULL OR actual_end_date >= actual_start_date);
ALTER TABLE event_umbrellas DROP CONSTRAINT IF EXISTS event_umbrellas_actual_days_order;
ALTER TABLE event_umbrellas ADD CONSTRAINT event_umbrellas_actual_days_order
  CHECK (actual_start_date IS NULL OR actual_end_date IS NULL OR actual_end_date >= actual_start_date);

-- ── 2. Safety guard: nothing to migrate in batches / licence files ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ops_license_batches b JOIN events e ON e.id = b.event_id WHERE e.umbrella_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM ops_license_files f JOIN events e ON e.id = f.event_id WHERE e.umbrella_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Licence batches or files already exist on child events of an umbrella. Remove them (or decide how to renumber) before running this migration.';
  END IF;
END $$;

-- ── 3. ops_event_vendors: vendor assignment per event OR per umbrella ───────
ALTER TABLE ops_event_vendors ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE ops_event_vendors DROP CONSTRAINT IF EXISTS ops_event_vendors_pkey;
ALTER TABLE ops_event_vendors ADD PRIMARY KEY (id);
ALTER TABLE ops_event_vendors ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE ops_event_vendors ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE;
-- Same shape the old primary key had, so today's upsert (onConflict event_id,vendor_id,purpose) still works.
ALTER TABLE ops_event_vendors DROP CONSTRAINT IF EXISTS ops_event_vendors_event_vendor_purpose_key;
ALTER TABLE ops_event_vendors ADD CONSTRAINT ops_event_vendors_event_vendor_purpose_key UNIQUE (event_id, vendor_id, purpose);
ALTER TABLE ops_event_vendors DROP CONSTRAINT IF EXISTS ops_event_vendors_umbrella_vendor_purpose_key;
ALTER TABLE ops_event_vendors ADD CONSTRAINT ops_event_vendors_umbrella_vendor_purpose_key UNIQUE (umbrella_id, vendor_id, purpose);
ALTER TABLE ops_event_vendors DROP CONSTRAINT IF EXISTS ops_event_vendors_one_owner;
ALTER TABLE ops_event_vendors ADD CONSTRAINT ops_event_vendors_one_owner CHECK ((event_id IS NULL) <> (umbrella_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_ops_event_vendors_umbrella ON ops_event_vendors(umbrella_id);

-- Move vendors assigned to a child event up to its umbrella.
UPDATE ops_event_vendors ev
   SET umbrella_id = e.umbrella_id, event_id = NULL
  FROM events e
 WHERE ev.event_id = e.id AND e.umbrella_id IS NOT NULL;

-- ── 4. ops_license_batches ──────────────────────────────────────────────────
ALTER TABLE ops_license_batches ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE ops_license_batches ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE;
ALTER TABLE ops_license_batches DROP CONSTRAINT IF EXISTS ops_license_batches_umbrella_batch_number_key;
ALTER TABLE ops_license_batches ADD CONSTRAINT ops_license_batches_umbrella_batch_number_key UNIQUE (umbrella_id, batch_number);
ALTER TABLE ops_license_batches DROP CONSTRAINT IF EXISTS ops_license_batches_one_owner;
ALTER TABLE ops_license_batches ADD CONSTRAINT ops_license_batches_one_owner CHECK ((event_id IS NULL) <> (umbrella_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_ops_license_batches_umbrella ON ops_license_batches(umbrella_id);

-- ── 5. ops_license_files ────────────────────────────────────────────────────
ALTER TABLE ops_license_files ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE ops_license_files ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE;
ALTER TABLE ops_license_files DROP CONSTRAINT IF EXISTS ops_license_files_one_owner;
ALTER TABLE ops_license_files ADD CONSTRAINT ops_license_files_one_owner CHECK ((event_id IS NULL) <> (umbrella_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_ops_license_files_umbrella ON ops_license_files(umbrella_id);

-- ── 6. Audit rows can be about an umbrella ──────────────────────────────────
ALTER TABLE ops_access_audit ADD COLUMN IF NOT EXISTS umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ops_access_audit_umbrella ON ops_access_audit(umbrella_id, created_at DESC);

COMMIT;
