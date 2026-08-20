-- In-app PR approvals for Khalifa's Task Manager pull requests — lets Madhu
-- approve/merge (or send back) a PR from inside EventPilot instead of
-- GitHub's UI. Fed by the existing pr-safety-summary GitHub Action via
-- POST /api/webhooks/github-pr (same trigger that already emails Madhu).
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS github_pr_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number       INT NOT NULL UNIQUE,
  pr_url          TEXT NOT NULL,
  pr_title        TEXT NOT NULL,
  author          TEXT NOT NULL,
  base_ref        TEXT NOT NULL DEFAULT 'main',
  head_sha        TEXT,
  ai_summary      TEXT,                     -- friendly 1-2 sentence explanation (Gemini), falls back to the mechanical summary if generation fails
  mechanical_summary TEXT NOT NULL,          -- "N files changed (+x -y)" — always available, no AI dependency
  areas_touched   TEXT[] NOT NULL DEFAULT '{}',
  verdict         TEXT NOT NULL CHECK (verdict IN ('SAFE', 'REVIEW_CLOSELY')),
  verdict_reason  TEXT,
  files_changed   TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent_back')),
  decided_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT,
  merge_error     TEXT,                     -- last merge attempt's error, if any — shown in the UI so a failed approve isn't silent
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_github_pr_reviews_status ON github_pr_reviews(status);

COMMIT;
