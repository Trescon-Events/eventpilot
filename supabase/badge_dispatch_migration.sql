-- Badge print hand-off (2026-10-02, Madhu): producer notifies Ops -> Ops reviews and sends the print file to the badge
-- printing vendor -> vendor downloads and confirms printed -> Ops notified. Plus the Ops section assignments ("who handles
-- what": Speaker Licences vs Badge Printing) that decide who gets access to a section and its notifications.
-- Additive only. Apply by hand (psql via the session pooler, or `!` in Claude Code).

BEGIN;

-- One row per hand-off of a print file. A dispatch freezes WHICH stored file it is (pdf_key) so regenerating the batch's
-- PDF later can't change what an in-flight dispatch points at. At most one active dispatch per batch.
CREATE TABLE IF NOT EXISTS badge_print_dispatches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID NOT NULL REFERENCES badge_batches(id) ON DELETE CASCADE,
  pdf_version           INTEGER NOT NULL,                      -- 1-based index into badge_batches.pdf_versions
  pdf_key               TEXT NOT NULL,                         -- private R2 object key, frozen at request time
  badges                INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'sent', 'downloaded', 'printed', 'revoked')),
  requested_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_note          TEXT,
  vendor_id             UUID REFERENCES ops_vendors(id) ON DELETE SET NULL,
  sent_by               UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  sent_at               TIMESTAMPTZ,
  first_downloaded_at   TIMESTAMPTZ,
  last_downloaded_at    TIMESTAMPTZ,
  download_count        INTEGER NOT NULL DEFAULT 0,
  printed_confirmed_at  TIMESTAMPTZ,
  printed_confirmed_by  UUID REFERENCES ops_vendor_users(id) ON DELETE SET NULL,
  printed_note          TEXT,
  revoked_by            UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  revoked_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_badge_dispatches_batch ON badge_print_dispatches(batch_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_badge_dispatches_vendor ON badge_print_dispatches(vendor_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_dispatches_one_active
  ON badge_print_dispatches(batch_id) WHERE status IN ('requested', 'sent', 'downloaded');

-- Ops section assignments: who is responsible for which Operations section, per event or per umbrella (an umbrella
-- assignment covers every event under it). Its own table on purpose — event_access_assignments rows can be rewritten
-- by the HRMS role sync. Owner is event_id XOR umbrella_id, like every other ops_* table.
CREATE TABLE IF NOT EXISTS ops_section_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  umbrella_id UUID REFERENCES event_umbrellas(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                                   -- 'licenses' | 'badges' (open text: new sections need no migration)
  staff_id    UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ops_section_assignments_one_owner CHECK ((event_id IS NOT NULL) <> (umbrella_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_section_assign_event ON ops_section_assignments(event_id, section, staff_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_section_assign_umbrella ON ops_section_assignments(umbrella_id, section, staff_id) WHERE umbrella_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_section_assign_staff ON ops_section_assignments(staff_id);

-- In-app bell items can now deep-link (the bell used to derive a link only from review_id / course_id).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link        TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id    UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS umbrella_id UUID;

COMMIT;
