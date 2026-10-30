-- Common Badges: one finished artwork printed in a quantity (security, protocol, organiser passes) — no names. A batch of this kind has quantity set and exactly one item (the design).
ALTER TABLE badge_batches ADD COLUMN IF NOT EXISTS quantity int CHECK (quantity IS NULL OR (quantity >= 1 AND quantity <= 5000));
