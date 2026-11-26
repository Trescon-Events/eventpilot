-- One lower third per speaker: speakers the producer chose to show WITHOUT a lower third (no usable moment).
ALTER TABLE session_videos ADD COLUMN IF NOT EXISTS cue_skipped JSONB NOT NULL DEFAULT '[]'::jsonb;
