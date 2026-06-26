-- ═══════════════════════════════════════════════════════════════════
-- CONTENT ENGINE V2 — Module B Upgrades
-- Event Pilot · Trescon Global
-- Created: 2026-06-26
-- ═══════════════════════════════════════════════════════════════════

-- ── Article/blog support on content_posts ────────────────────────

ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'social'
    CHECK (format IN ('social', 'article')),
  ADD COLUMN IF NOT EXISTS article_headline TEXT,
  ADD COLUMN IF NOT EXISTS article_body TEXT,
  ADD COLUMN IF NOT EXISTS seo_tags TEXT[],
  ADD COLUMN IF NOT EXISTS external_post_id TEXT;

-- ── Social post analytics tracking ──────────────────────────────

CREATE TABLE IF NOT EXISTS content_post_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  external_post_id TEXT,
  impressions     INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_analytics_post_idx ON content_post_analytics(post_id);
CREATE INDEX IF NOT EXISTS content_analytics_date_idx ON content_post_analytics(fetched_at);

-- ═══════════════════════════════════════════════════════════════════
-- END
-- ═══════════════════════════════════════════════════════════════════
