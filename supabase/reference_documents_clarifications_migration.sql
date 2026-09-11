-- Reference Documents spec — extraction-time clarification Q&A (2026-09-10,
-- agreed with Madhu after Stage 3). Extends the upload/extraction pipeline
-- (app/api/events/stakeholders/messaging/route.ts) so Gemini's structuring
-- pass surfaces its own uncertainty as structured multiple-choice questions
-- — same shape as an AskUserQuestion call: a set of concrete options each
-- with a label + one-line description, plus an optional free-text "Other"
-- — instead of silently guessing or leaving a permanent gap (see the
-- "Sheikh Maktoum" protocol-string rule from Stage 3 for the motivating
-- case). Runs in rounds, capped at 5: each answered batch is fed back to
-- Gemini, which folds the answers into structured_json and decides whether
-- anything new needs asking. No early exit — Madhu: "these are important
-- documents... let them go through the questions." Past round 5, whatever
-- is still unanswered becomes a permanent, visible-but-non-blocking flag
-- on the doc rather than continuing to prompt or silently dropping it.

ALTER TABLE event_messaging_docs ADD COLUMN IF NOT EXISTS clarification_rounds_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS event_messaging_doc_clarifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id         UUID NOT NULL REFERENCES event_messaging_docs(id) ON DELETE CASCADE,
  round          INTEGER NOT NULL,
  question_key   TEXT NOT NULL,
  question_text  TEXT NOT NULL,
  context        TEXT,
  section_id     TEXT,
  -- [{value, label, description}] — mirrors AskUserQuestion's option shape.
  options        JSONB NOT NULL,
  allows_other   BOOLEAN NOT NULL DEFAULT true,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
  answer_value   TEXT,  -- the selected option's `value`, or 'other'
  answer_note    TEXT,  -- free text — required when answer_value = 'other'
  answered_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  answered_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, question_key)
);
CREATE INDEX IF NOT EXISTS idx_doc_clarifications_doc ON event_messaging_doc_clarifications (doc_id, round);
