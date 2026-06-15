-- Track last login time per staff member (both password + SSO)
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
