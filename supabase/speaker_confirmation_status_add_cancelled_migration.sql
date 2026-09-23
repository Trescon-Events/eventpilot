-- Add 'Cancelled' to event_speakers.confirmation_status (2026-09-23)
--
-- Built for the DFS speaker roster consolidation against the producers'
-- 18-Sep-2026 status sheet: speakers present in EventPilot but missing from
-- that sheet are being marked Cancelled rather than removed, since they may
-- reconfirm later. Same pattern as 'On Hold' being added to this same check
-- constraint on 2026-09-08 (see speaker_producer_reference_confirmation_
-- migration.sql for the column's original history/rationale).
--
-- Cancelled speakers stay fully visible in the Stakeholder Hub roster and
-- Status Board (just labeled Cancelled) — this is deliberately NOT the same
-- as the existing soft-delete/archive flow (DELETE .../speakers/[id] sets
-- announcement_status='archived', moves to the Deleted tab), which is a
-- separate content-publishing-state mechanism.
--
-- Run manually via the direct-psql session-pooler connection (this repo has
-- no migration runner, all files under supabase/ are applied by hand).

BEGIN;

ALTER TABLE event_speakers DROP CONSTRAINT event_speakers_confirmation_status_check;

ALTER TABLE event_speakers ADD CONSTRAINT event_speakers_confirmation_status_check
  CHECK (confirmation_status IS NULL OR confirmation_status = ANY (ARRAY[
    'New Confirmed', 'Reconfirmed', 'Confirmed', 'On Hold', 'Cancelled'
  ]));

COMMIT;
