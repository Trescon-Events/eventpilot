-- Background-job tracking for the KonfHub Attendee Registration push
-- (2026-08-25) — see app/api/events/stakeholders/speakers/[id]/
-- konfhub-registration-push/route.ts. Live-tested right after shipping:
-- the synchronous version hit the exact same Cloudflare ~100s proxy
-- timeout the Clean Photo pipeline hit earlier this session (confirmed via
-- the same "tresconglobal.com | 502: Bad gateway" non-JSON response
-- signature) — the KonfHub Capture API call from Railway's network path
-- ran long enough to trip it, even though a direct call from this machine
-- returned fast. Same fix as Clean Photo and the other 6 routes fixed
-- earlier this session: fire-and-forget background job + polling, instead
-- of awaiting the external call inline.
--
-- Extra caution here versus those other jobs: this push is CREATE-ONLY
-- against real, capacity-limited KonfHub registrations — a double-click
-- while a job is still 'processing' must not be able to kick off a second
-- job (see the route's own in-flight check), since event_speakers.
-- konfhub_booking_id alone can't catch that window (it's only set once the
-- job actually finishes).
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS speaker_konfhub_registration_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id    UUID NOT NULL REFERENCES event_speakers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  result        JSONB,         -- set on status='done': { konfhub_booking_id, konfhub_registration_synced_at }
  error_message TEXT,          -- set on status='error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS speaker_konfhub_registration_jobs_speaker_id_idx ON speaker_konfhub_registration_jobs(speaker_id);

COMMIT;
