-- Badges: "Move to another batch" — a badge that needs a different template leaves this batch (removed = true) and starts again in a batch with that template.
-- moved_to_batch_id says where it went, so the badge shows "Moved to …" here and cannot be restored by mistake. Additive.
ALTER TABLE badge_batch_items ADD COLUMN IF NOT EXISTS moved_to_batch_id UUID REFERENCES badge_batches(id) ON DELETE SET NULL;
