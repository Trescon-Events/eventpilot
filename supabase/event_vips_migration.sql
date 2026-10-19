-- VIP stakeholder list (2026-10-19, Madhu): clients of managed events (DIFC for DFFW, KSDC for BSS) send us VIP lists by hand.
-- A VIP exists only so we can print a badge for them: name, job title, company, country. Photo is optional (not wired in the UI yet).
-- Badge batches can now be built from VIPs: badge_batch_items.vip_id points at the VIP the item was frozen from.
-- Additive only — no existing table is changed except one new nullable column.

BEGIN;

CREATE TABLE IF NOT EXISTS event_vips (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  job_title            TEXT,
  company              TEXT,
  country              TEXT,
  photo_url            TEXT,
  photo_head_box       JSONB,
  created_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_vips_event ON event_vips(event_id, name);

ALTER TABLE badge_batch_items ADD COLUMN IF NOT EXISTS vip_id UUID REFERENCES event_vips(id) ON DELETE SET NULL;

COMMIT;
