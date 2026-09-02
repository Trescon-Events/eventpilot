-- Vendor accounts — external agencies (Cactus, Pixelate, ...) who get an
-- EventPilot login (via their own Microsoft 365 mailbox, SSO) restricted to
-- an admin-chosen allow-list of modules instead of the normal broad-by-default
-- staff access. See app/lib/registry/access.ts checkAccess() for the gate,
-- and app/admin/vendor-accounts for the admin UI that manages it.
--
-- Run manually in the Supabase Dashboard SQL editor (project
-- yuyxfxoevztugtfgduks) — this repo has no migration runner, all files
-- under supabase/ are applied by hand.

BEGIN;

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'internal' CHECK (account_type IN ('internal', 'vendor'));

-- Agency display name (e.g. "Pixelate", "Cactus") — null for internal staff.
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS vendor_label TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_members_account_type ON staff_members(account_type);

-- Named people at a vendor sharing one login (e.g. Pixelate's designers),
-- so a task can be tagged with who at the agency should pick it up without
-- each of them needing their own Microsoft 365 seat. Not staff_members rows
-- — these are labels only, with no login/auth of their own.
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON vendor_contacts(vendor_staff_id);

-- Optional "who at the vendor should take this up" tag on a task — separate
-- from assigned_to (which stays the shared vendor login, the real auth/timer/
-- notification identity). Null for every non-vendor task.
ALTER TABLE task_manager_tasks
  ADD COLUMN IF NOT EXISTS assigned_contact_id UUID REFERENCES vendor_contacts(id) ON DELETE SET NULL;

COMMIT;

-- Verify manually:
-- SELECT id, name, email, account_type, vendor_label FROM staff_members WHERE account_type = 'vendor';
-- SELECT * FROM vendor_contacts;
