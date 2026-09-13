-- Site Operations module, Phase 2 — one shared org-level Google connection
-- (GA4 + Search Console), replacing the per-staff model the old (now-deleted)
-- Drive integration used. Singleton table: exactly one row, pre-seeded here
-- so `select('*').limit(1).single()` always has something to find, same
-- pattern as kb_intel_config. See docs/EventPilot-SiteOps-Build-Spec-v1.1.md.

create table if not exists google_org_connection (
  id                  uuid primary key default gen_random_uuid(),
  access_token_enc    text,
  refresh_token_enc   text,
  expires_at          timestamptz,
  google_account_email text,
  connected_by        text,
  connected_at        timestamptz,
  updated_at          timestamptz default now()
);

insert into google_org_connection (id)
select gen_random_uuid()
where not exists (select 1 from google_org_connection);
