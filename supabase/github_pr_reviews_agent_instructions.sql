-- Adds the AI-rewritten, copy-pasteable instruction block Madhu's "Send Back"
-- note gets turned into for Khalifa to paste into Antigravity. Additive only.
-- Applied via `supabase db query --linked -f <path>` (see HANDOFF.md note on
-- the run_sql RPC not existing in this database).

BEGIN;

ALTER TABLE github_pr_reviews
  ADD COLUMN IF NOT EXISTS agent_instructions TEXT;

COMMIT;
