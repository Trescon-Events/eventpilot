-- ─── PR CONTENT STUDIO — PRESS RELEASE GENERATOR (Phase 1) ────────────────
-- Research chat → generate → versioned drafts → approval, scoped per event.
-- Reuses the per-event RBAC system (access_rbac.sql) for permissions —
-- see app/lib/registry/access-permissions.ts for the new sae.content_studio.*
-- keys, and event_access_assignments for how a "PR Team" role gets assigned.

CREATE TABLE IF NOT EXISTS press_releases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,               -- working title, staff-editable
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','in_review','approved','published')),
  created_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_press_releases_event ON press_releases(event_id);

-- Immutable, monotonically-numbered snapshots per press release — same shape
-- as corporate_deck_versions (supabase/corporate_marketing.sql). PR copy
-- needs full draft history, not just current state, unlike content_posts'
-- single-row-plus-status shape.
CREATE TABLE IF NOT EXISTS press_release_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  press_release_id   UUID NOT NULL REFERENCES press_releases(id) ON DELETE CASCADE,
  version_number     INT NOT NULL,             -- monotonic per press_release_id
  headline           TEXT,
  dateline           TEXT,
  body               TEXT NOT NULL,
  boilerplate        TEXT,
  research_summary   TEXT,                     -- snapshot of the research session used to ground this draft
  custom_instruction TEXT,                     -- staff's free-text ask at generation time, if any
  generated_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  approved_by        UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (press_release_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_press_release_versions_pr ON press_release_versions(press_release_id);

-- Generalized (not press-release-specific) so Email Campaign / Video Script
-- tools can reuse the same research-chat plumbing in a later phase without a
-- new table each time.
CREATE TABLE IF NOT EXISTS content_research_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,                  -- 'press_release' for this phase
  item_id     UUID,                           -- press_releases.id once one exists; nullable for pre-creation research
  staff_id    UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_research_sessions_item ON content_research_sessions(item_id);

CREATE TABLE IF NOT EXISTS content_research_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES content_research_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_research_messages_session ON content_research_messages(session_id);
