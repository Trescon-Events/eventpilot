-- ─── TRESCON CONTENT ENGINE ───────────────────────────────────────────────────
-- Run this in your Supabase SQL editor after documents_events.sql

-- ─── CONTENT CAMPAIGNS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  objective      TEXT DEFAULT '',
  phase          TEXT NOT NULL DEFAULT 'pre_event'
                   CHECK (phase IN ('pre_event', 'live_week', 'post_event', 'always_on')),
  status         TEXT NOT NULL DEFAULT 'planning'
                   CHECK (status IN ('planning', 'active', 'paused', 'completed')),
  platforms      TEXT[] DEFAULT '{}',
  posts_per_week JSONB DEFAULT '{}',        -- { "LinkedIn": 3, "Instagram": 5, ... }
  weeks          JSONB DEFAULT '[]',        -- narrative week plan
  start_date     TEXT,                      -- YYYY-MM-DD
  duration_weeks INTEGER DEFAULT 4,
  brand_notes    TEXT DEFAULT '',           -- team's manual additions on top of brief
  created_by     UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTENT POSTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES content_campaigns(id) ON DELETE CASCADE,
  week_number    INTEGER NOT NULL,
  narrative_role TEXT NOT NULL DEFAULT 'Awareness',
  platform       TEXT NOT NULL
                   CHECK (platform IN ('LinkedIn','Instagram','Facebook','Twitter','YouTube')),
  scheduled_date TEXT NOT NULL,             -- YYYY-MM-DD
  scheduled_time TEXT NOT NULL DEFAULT '09:00',
  status         TEXT NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','generated','approved','posted')),
  text           TEXT DEFAULT '',
  image_url      TEXT DEFAULT '',
  image_seed     INTEGER,
  published_at   TIMESTAMPTZ,
  publish_error  TEXT,
  revision_note  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POST COMMENTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  staff_id   UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONNECTED SOCIAL ACCOUNTS (per event) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS connected_social_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES events(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,              -- lowercase: instagram, linkedin, facebook, twitter, youtube
  access_token TEXT NOT NULL,
  page_id      TEXT,                       -- IG business account ID / FB page ID / LinkedIn URN
  account_name TEXT,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, platform)
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_campaigns_event_id    ON content_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_status      ON content_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_campaign_id     ON content_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_status          ON content_posts(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled_date  ON content_posts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id         ON content_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_event_id      ON connected_social_accounts(event_id);
