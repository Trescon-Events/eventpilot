-- Producer confirms the lower-third cues (reviewed against video snapshots) before the preview render.
-- Holds a fingerprint of the cues that were confirmed; any later change to the cues makes it stale automatically.
ALTER TABLE session_videos ADD COLUMN IF NOT EXISTS cues_confirmed_fingerprint TEXT;
