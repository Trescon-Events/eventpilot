-- Memento artwork variant (2026-10-22). Additive only.
-- variant_id: which Memento template (events.creative_template_config speaker variant id) rendered the batch; null = raw Cleaned Photos (legacy).
-- source_photo_url: the Cleaned Photo the artwork was rendered from, so "photo changed since" still compares source-to-source
-- (memento_batch_items.photo_url now holds the rendered artwork when a variant is used).
ALTER TABLE memento_batches ADD COLUMN IF NOT EXISTS variant_id text;
ALTER TABLE memento_batch_items ADD COLUMN IF NOT EXISTS source_photo_url text;
