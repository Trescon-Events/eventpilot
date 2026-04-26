-- ─── DOCUMENTS ───────────────────────────────────────────────────────────────
-- Stores extracted text from uploaded PDFs. The original file is never saved.
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('policy','event_brief','staff_doc','onboarding','other')),
  extracted_text TEXT NOT NULL,
  word_count     INTEGER DEFAULT 0,
  visibility     TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','event_only')),
  event_id       UUID REFERENCES events(id) ON DELETE SET NULL,
  uploaded_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  is_active      BOOLEAN DEFAULT TRUE
);

-- ─── EVENTS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('conference','summit','forum','awards','workshop','other')),
  status         TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','cancelled')),
  event_date     DATE,
  venue          TEXT,
  city           TEXT,
  client_name    TEXT,
  description    TEXT,
  created_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EVENT STAFF ASSIGNMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id   UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  role       TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, staff_id)
);

-- ─── FIX: documents table references events, so events must exist first ───────
-- Run this order: events → documents (if FK needed) or keep event_id nullable

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_type       ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_event_id   ON documents(event_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_active  ON documents(is_active);
CREATE INDEX IF NOT EXISTS idx_events_status        ON events(status);
CREATE INDEX IF NOT EXISTS idx_event_staff_event_id ON event_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_staff_id ON event_staff(staff_id);
