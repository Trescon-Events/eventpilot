-- Operations Hub, Phase 3: vendor portal accounts, sessions, licence files (2026-09-25)
--
-- External licence vendors get their OWN login system. It shares nothing
-- with staff auth: no staff_members rows, no tcs_session cookie, no SSO.
-- (The older "vendor accounts" in supabase/vendor_accounts.sql are staff_members
-- rows with account_type='vendor' for Task Manager agencies — a different
-- model, deliberately not reused here.)
--
-- Design points (see the Operations Hub memory for the full rationale):
--  * Username = the vendor user's email address.
--  * Passwords are set BY THE VENDOR through a one-time emailed link (invite
--    or reset). Ops never sees, chooses or transmits a password.
--  * Every login is password + captcha + an emailed one-time code.
--  * Sessions are opaque random tokens stored HASHED in the DB — not signed
--    cookies — so a password reset, disable, or unassign can revoke them
--    instantly. No raw token, code or password is ever stored.
--  * All tables have RLS enabled with NO policies: only the server-side
--    service role can touch them, never the public anon key.
--
-- Run manually via the Supabase session-pooler psql connection — this repo
-- has no migration runner, all files under supabase/ are applied by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_vendor_users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID NOT NULL REFERENCES ops_vendors(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES ops_vendor_contacts(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,                       -- stored lowercase; this IS the username
  password_hash    TEXT,                                -- null until the vendor sets one via the invite link
  status           TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_by       UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One login = one vendor. An email can never belong to two vendor accounts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_vendor_users_email ON ops_vendor_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_ops_vendor_users_vendor ON ops_vendor_users(vendor_id);

-- One-time links for setting a password (first login) or resetting it.
-- Only the SHA-256 of the token is stored; the raw value exists only in the
-- email. Single use, short expiry.
CREATE TABLE IF NOT EXISTS ops_vendor_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES ops_vendor_users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_by  UUID REFERENCES staff_members(id) ON DELETE SET NULL,   -- null = vendor-initiated forgot-password
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_vendor_tokens_user ON ops_vendor_tokens(user_id);

-- Emailed one-time login codes (second factor). Hashed, short-lived, and
-- limited attempts per code.
CREATE TABLE IF NOT EXISTS ops_vendor_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES ops_vendor_users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  used_at     TIMESTAMPTZ,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_vendor_otps_user ON ops_vendor_otps(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_vendor_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES ops_vendor_users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,                  -- absolute lifetime cap
  revoked_at    TIMESTAMPTZ,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS idx_ops_vendor_sessions_user ON ops_vendor_sessions(user_id);

-- Attempt log for per-account and per-IP throttling (mirrors login_attempts).
CREATE TABLE IF NOT EXISTS ops_vendor_auth_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT,
  ip          TEXT,
  kind        TEXT NOT NULL,        -- login | otp | forgot | set_password
  success     BOOLEAN NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_vendor_auth_events_email ON ops_vendor_auth_events(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_vendor_auth_events_ip ON ops_vendor_auth_events(ip, created_at DESC);

-- Licence copies. One file may cover several batches (ops may receive a
-- single licence for many batches at the end), hence the link table.
CREATE TABLE IF NOT EXISTS ops_license_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id         UUID NOT NULL REFERENCES ops_vendors(id) ON DELETE RESTRICT,
  storage_path      TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size         BIGINT,
  uploaded_by_type  TEXT NOT NULL CHECK (uploaded_by_type IN ('vendor','staff')),
  uploaded_by_id    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_license_files_event ON ops_license_files(event_id);

CREATE TABLE IF NOT EXISTS ops_license_file_batches (
  file_id   UUID NOT NULL REFERENCES ops_license_files(id) ON DELETE CASCADE,
  batch_id  UUID NOT NULL REFERENCES ops_license_batches(id) ON DELETE CASCADE,
  PRIMARY KEY (file_id, batch_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_license_file_batches_batch ON ops_license_file_batches(batch_id);

-- Private bucket for licence copies (same access model as
-- speaker-sensitive-documents: never public, server-mediated reads only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('ops-license-files', 'ops-license-files', false)
ON CONFLICT (id) DO NOTHING;

-- Defence in depth: RLS on, no policies => the public anon key can read and
-- write none of this. (The project already auto-enables RLS on new tables;
-- stating it here keeps the migration self-sufficient.)
ALTER TABLE ops_vendor_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vendor_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vendor_otps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vendor_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vendor_auth_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_license_files       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_license_file_batches ENABLE ROW LEVEL SECURITY;

COMMIT;
