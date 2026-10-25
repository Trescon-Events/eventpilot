-- Speaker Proposals (2026-10-25): the event's CLIENT APPROVERS list — people (name + email) saved once per event and picked per drop.
-- Picking one for a drop creates that drop's reviewer row (private link) as before; this table is only the address book.
CREATE TABLE IF NOT EXISTS speaker_proposal_approvers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, email)
);
ALTER TABLE speaker_proposal_approvers ENABLE ROW LEVEL SECURITY;
-- Existing reviewers of already-shared drops join the list so nobody has to be typed in again.
INSERT INTO speaker_proposal_approvers (event_id, name, email)
  SELECT DISTINCT ON (b.event_id, lower(r.email)) b.event_id, r.name, lower(r.email)
  FROM speaker_proposal_reviewers r JOIN speaker_proposal_batches b ON b.id = r.batch_id
  ORDER BY b.event_id, lower(r.email), r.created_at
ON CONFLICT (event_id, email) DO NOTHING;
