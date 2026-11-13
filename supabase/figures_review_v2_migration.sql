-- Public figures review v2 (13 Nov 2026): named reviewers, live shared feedback, sequential internal then client rounds.
--
--  * event_public_figure_approvers   the event's post-event client approvers (name + email), separate from the badge / announcement contacts
--  * event_public_figure_reviewers   one row per person in a review round. Staff reviewers sign in (staff_id); client approvers get their own personal link (token).
--  * event_public_figure_decisions   gains reviewer_id (who) and seen_label / seen_payload (the value they were looking at), so the producer can compare it with the working value.
--
-- Nothing existing is dropped except the old "one decision per item per round" uniqueness, which is replaced by "one per item per round per reviewer".
-- No round has been sent on any real event, so no existing data changes. Run by hand through the session-pooler psql connection. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS event_public_figure_approvers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_figure_approvers_email ON event_public_figure_approvers (event_id, LOWER(email));

CREATE TABLE IF NOT EXISTS event_public_figure_reviewers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id      UUID NOT NULL REFERENCES event_public_figure_reviews(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('staff', 'client')),
  staff_id       UUID,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  token          TEXT UNIQUE,
  notified_at    TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  done_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_figure_reviewers_review ON event_public_figure_reviewers (review_id);
CREATE INDEX IF NOT EXISTS idx_figure_reviewers_staff ON event_public_figure_reviewers (staff_id) WHERE staff_id IS NOT NULL;

ALTER TABLE event_public_figure_decisions ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES event_public_figure_reviewers(id) ON DELETE CASCADE;
ALTER TABLE event_public_figure_decisions ADD COLUMN IF NOT EXISTS seen_label TEXT;
ALTER TABLE event_public_figure_decisions ADD COLUMN IF NOT EXISTS seen_payload JSONB;
ALTER TABLE event_public_figure_decisions DROP CONSTRAINT IF EXISTS event_public_figure_decisions_review_id_figure_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_figure_decisions_reviewer ON event_public_figure_decisions (review_id, figure_id, reviewer_id);

ALTER TABLE event_public_figure_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_public_figure_reviewers ENABLE ROW LEVEL SECURITY;

COMMIT;
