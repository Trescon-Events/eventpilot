-- Badges: edit one badge's text on an APPROVED batch and regenerate it in place (instead of leaving it out and making a separate batch).
-- Records when a badge was changed after the batch was approved, so the team can see it and knows the print file must be generated again. Additive.
ALTER TABLE badge_batch_items ADD COLUMN IF NOT EXISTS edited_after_approval_at TIMESTAMPTZ;
