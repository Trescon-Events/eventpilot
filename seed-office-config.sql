-- ============================================================
-- TAOS Discovery — Office headcount config table
-- Run this in Supabase SQL editor ONCE
-- ============================================================

CREATE TABLE IF NOT EXISTS office_config (
  office_id   TEXT PRIMARY KEY,
  total_staff INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed with current headcounts (admin can update these via dashboard)
INSERT INTO office_config (office_id, total_staff) VALUES
  ('dubai',     15),
  ('bangalore', 91),
  ('mangalore', 15),
  ('manipal',   63)
ON CONFLICT (office_id) DO NOTHING;

-- Public read (the landing page needs this without auth)
ALTER TABLE office_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_office_config" ON office_config FOR SELECT USING (true);
-- Writes go through the service-role API route only (no client-side write policy needed)
