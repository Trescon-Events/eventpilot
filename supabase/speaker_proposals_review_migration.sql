-- Speaker Proposals Phase 3 (2026-10-24): client review. Reviewers get personal open links; the FIRST decision on a speaker settles that speaker.
ALTER TABLE speaker_proposal_batches
  ADD COLUMN IF NOT EXISTS shared_at       timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by       text,
  ADD COLUMN IF NOT EXISTS shared_by_name  text,
  ADD COLUMN IF NOT EXISTS shared_by_email text,
  ADD COLUMN IF NOT EXISTS share_message   text;

CREATE TABLE IF NOT EXISTS speaker_proposal_reviewers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid NOT NULL REFERENCES speaker_proposal_batches(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text NOT NULL,
  token            text NOT NULL UNIQUE,
  notified_at      timestamptz,
  last_opened_at   timestamptz,
  reminder_count   int NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS speaker_proposal_reviewers_email_idx ON speaker_proposal_reviewers (batch_id, lower(email));

-- One settled decision per speaker (primary key = candidate): whoever records it first wins; only they can change it afterwards.
CREATE TABLE IF NOT EXISTS speaker_proposal_decisions (
  candidate_id  uuid PRIMARY KEY REFERENCES speaker_proposal_candidates(id) ON DELETE CASCADE,
  decision      text NOT NULL CHECK (decision IN ('approved','rejected')),
  reviewer_id   uuid REFERENCES speaker_proposal_reviewers(id) ON DELETE SET NULL,
  reviewer_name text NOT NULL,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS speaker_proposal_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES speaker_proposal_candidates(id) ON DELETE CASCADE,
  reviewer_id   uuid REFERENCES speaker_proposal_reviewers(id) ON DELETE SET NULL,
  reviewer_name text NOT NULL,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS speaker_proposal_comments_candidate_idx ON speaker_proposal_comments (candidate_id, created_at);

ALTER TABLE speaker_proposal_reviewers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_proposal_decisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_proposal_comments   ENABLE ROW LEVEL SECURITY;
