-- Speaker Proposals (2026-10-24): research proposed speakers from a spreadsheet, producers review each card, the client approves / rejects.
-- Additive. Phase 2 = tracks, batches, candidates. (Client review tables arrive with Phase 3.)

CREATE TABLE IF NOT EXISTS speaker_proposal_tracks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        text NOT NULL,
  day_label   text,
  stage       text,
  time_label  text,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS speaker_proposal_tracks_event_idx ON speaker_proposal_tracks (event_id, position);

CREATE TABLE IF NOT EXISTS speaker_proposal_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name             text NOT NULL,
  source_filename  text,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS speaker_proposal_batches_event_idx ON speaker_proposal_batches (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS speaker_proposal_candidates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       uuid NOT NULL REFERENCES speaker_proposal_batches(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position       int NOT NULL DEFAULT 0,
  raw            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the spreadsheet row exactly as uploaded (never shown to the client)
  input          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- cleaned: name, designation, company, country, linkedin, track_text
  track_id       uuid REFERENCES speaker_proposal_tracks(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','researching','researched','error')),
  research       jsonb,                                -- INTERNAL: findings, concerns, sources, verification, candidate photos/logos
  card           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- CLEAN: exactly what the client sees
  review_state   text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','ready','excluded')),
  producer_notes text,
  error          text,
  started_at     timestamptz,
  researched_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS speaker_proposal_candidates_batch_idx ON speaker_proposal_candidates (batch_id, position);

ALTER TABLE speaker_proposal_tracks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_proposal_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_proposal_candidates ENABLE ROW LEVEL SECURITY;
