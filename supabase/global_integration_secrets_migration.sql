-- Global Integration Secrets (2026-09-21, Madhu) — a UI-managed alternative
-- to a Railway env var for a credential shared across every event, not
-- scoped to any one of them. Built directly in response to a real gap: found
-- live that HUBSPOT_CRM_SERVICE_KEY was never actually added to Railway's
-- production environment, so the whole CRM-to-HubSpot sync had been silently
-- failing there this entire time — an env var can drift/get forgotten with
-- no UI trace it's missing. Storing it here instead means: it's paste-once
-- in the app itself (no Railway access needed to rotate it), and there's a
-- visible "configured / not configured" status instead of a silent runtime
-- failure discovered by accident.
--
-- Encrypted at rest with the same AES-256-GCM helper already used for OAuth
-- tokens (app/lib/security/token-crypto.ts, OAUTH_TOKEN_ENCRYPTION_KEY) —
-- reused rather than inventing a second encryption scheme. Never decrypted
-- back to the browser once saved; the UI only ever shows a status line
-- ("Configured, last updated ...") and a fresh input to overwrite it.
--
-- `id` is a fixed slug per secret (e.g. 'hubspot_crm_service_key'), not a
-- generated uuid — this is a small, known set of global credentials, looked
-- up by name, not a growing user-facing list.
create table if not exists global_integration_secrets (
  id text primary key,
  label text not null,
  encrypted_value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff_members(id) on delete set null
);
