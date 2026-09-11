-- Reference Documents spec — clarification-to-validation-rule bridge
-- (2026-09-10, agreed with Madhu after Stage 4). See
-- app/lib/content/clarifications.ts's processAnsweredRound(): when an
-- answered clarification defines a checkable constraint (an exact required
-- wording, a banned term), a candidate event_validation_rules row is
-- proposed automatically — but never auto-activated. review_status tracks
-- whether it's still pending a human's Accept/Dismiss; is_active (already
-- existed, Stage 3) stays the actual on/off switch resolve-validation-
-- rules.ts checks, unaffected until a producer explicitly accepts it.

ALTER TABLE event_validation_rules ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (review_status IN ('suggested', 'accepted', 'dismissed'));
ALTER TABLE event_validation_rules ADD COLUMN IF NOT EXISTS source_clarification_id UUID
  REFERENCES event_messaging_doc_clarifications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_validation_rules_suggested ON event_validation_rules (event_id) WHERE review_status = 'suggested';
