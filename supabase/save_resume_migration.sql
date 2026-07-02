-- Save & Resume — shared active_drafts registry
-- See docs/roadmap-save-resume.md for the design rationale.

CREATE TABLE IF NOT EXISTS active_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who owns this draft
  user_id           UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,

  -- Which tool, which event context (nullable for global tools)
  tool_key          TEXT NOT NULL,
  event_id          UUID REFERENCES events(id) ON DELETE CASCADE,

  -- Pointer into the tool's own draft table (e.g. event_websites.id).
  -- Nullable — the draft can exist in the registry before the tool has
  -- persisted anything of its own.
  tool_record_id    TEXT,

  -- What the sidebar item should say
  display_label     TEXT NOT NULL,        -- e.g. "World AI Show Indonesia"
  status_text       TEXT,                 -- e.g. "Website Draft v2", "Speaker Page — Incomplete"

  last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Multi-user handoff. Personal by default; owner opts in to share.
  shared_with_team  BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active draft per (user, tool, event). Upserts on save use this.
  UNIQUE (user_id, tool_key, event_id)
);

CREATE INDEX IF NOT EXISTS idx_active_drafts_user_recent
  ON active_drafts (user_id, last_updated DESC);

-- Team-shared drafts: fast lookup of "what's shared for this event+tool"
CREATE INDEX IF NOT EXISTS idx_active_drafts_shared
  ON active_drafts (event_id, tool_key, last_updated DESC)
  WHERE shared_with_team = true;

-- PostgREST cache
NOTIFY pgrst, 'reload schema';
