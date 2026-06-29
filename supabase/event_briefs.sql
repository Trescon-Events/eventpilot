-- ── Event Intelligence Brief ────────────────────────────────────────────────
-- Single source of truth for what an event is about.
-- Every AI tool on the platform reads from this table.

CREATE TABLE IF NOT EXISTS event_briefs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,

  -- ── Positioning ──────────────────────────────────────────────────────────
  elevator_pitch        TEXT,                          -- 2-line event pitch
  value_proposition     TEXT,                          -- Why should someone attend?
  target_audience       TEXT,                          -- Who is this for?
  industry_focus        TEXT[],                        -- e.g. ['Fintech', 'Banking', 'Insurance']
  geography_focus       TEXT[],                        -- e.g. ['Middle East', 'Africa', 'South Asia']

  -- ── Messaging ────────────────────────────────────────────────────────────
  key_themes            TEXT[],                        -- 3-5 content pillars
  key_messages          TEXT[],                        -- What we want people to remember
  tone_of_voice         TEXT[],                        -- e.g. ['authoritative', 'forward-thinking']
  tagline               TEXT,                          -- Event tagline
  hashtags              TEXT[],                        -- Official hashtags

  -- ── Commercial ───────────────────────────────────────────────────────────
  revenue_target        NUMERIC(14,2),                 -- Total revenue target
  sponsor_value_prop    TEXT,                          -- Why sponsors should participate
  delegate_target       INTEGER,                       -- Target delegate count
  delegate_profile      TEXT,                          -- Who is the ideal delegate?
  pricing_notes         TEXT,                          -- Pricing strategy

  -- ── Competition ──────────────────────────────────────────────────────────
  competing_events      JSONB DEFAULT '[]',            -- [{name, organizer, date, url, notes}]
  differentiators       TEXT[],                        -- Why us, not them
  market_positioning    TEXT,                          -- Where we sit in the market

  -- ── Success Metrics ──────────────────────────────────────────────────────
  attendance_target     INTEGER,
  nps_target            NUMERIC(4,1),
  media_coverage_goals  TEXT,
  other_kpis            JSONB DEFAULT '[]',            -- [{metric, target, unit}]

  -- ── Meta ──────────────────────────────────────────────────────────────────
  completion_pct        INTEGER NOT NULL DEFAULT 0,    -- 0-100 calculated on save
  last_edited_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_briefs_event_idx ON event_briefs(event_id);

ALTER TABLE event_briefs ENABLE ROW LEVEL SECURITY;
