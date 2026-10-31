-- Table Screens, Phase 2: what each table's screen should show right now, and the status of the technician's program.
-- One row per event. The console writes `state` (bumping `seq`); the program on the technician's laptop reads it and reports back in `program`.
CREATE TABLE IF NOT EXISTS event_table_screens_live (
  event_id        uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  state           jsonb NOT NULL DEFAULT '{}'::jsonb,
  seq             bigint NOT NULL DEFAULT 0,
  program         jsonb,
  program_seen_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE event_table_screens_live ENABLE ROW LEVEL SECURITY;   -- reached only through the server (service role)
