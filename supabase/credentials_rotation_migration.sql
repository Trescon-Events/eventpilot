-- Keys & Credentials rotation log (2026-10-22, Madhu): remembers WHEN each credential in
-- app/lib/registry/credentials.ts was last rotated and by whom, so the next rotation day
-- starts from "what is overdue" instead of memory. Stores NO secret values — ids and dates only.
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS credential_rotations (
  credential_id   TEXT PRIMARY KEY,                 -- matches CREDENTIALS[].id in the registry
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_by      TEXT,                              -- display name of the admin who marked it
  note            TEXT
);

COMMIT;
