-- Site Operations module — Phase 0
-- Drops the dead TAOS-era event_sites table (confirmed 0 rows in production,
-- last touched 17 Jul 2026, superseded by nothing that ever shipped) and
-- recreates it with the shape needed for the new Site Registry, plus the
-- three new supporting tables. See docs/EventPilot-SiteOps-Build-Spec-v1.1.md.

drop table if exists event_sites cascade;

create table event_sites (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid references events(id) on delete cascade not null,
  live_url            text,
  repo_url            text,
  preview_url         text,
  hosting_provider    text,
  cf_account_id       text,
  cf_project_name     text,
  cf_zone_id          text,
  deploy_hook_url     text,
  last_deploy_at      timestamptz,
  last_deploy_status  text,
  build_framework     text,
  registrable_domain  text,
  launch_scenario     text check (launch_scenario in ('new_domain_new_series','new_domain_existing_series','existing_domain_new_edition')),
  commissioning_state text default 'registered'
                      check (commissioning_state in ('registered','in_progress','commissioned','archived')),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_event_sites_domain on event_sites(registrable_domain);

create table if not exists site_connections (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references event_sites(id) on delete cascade not null,
  provider        text not null,   -- ga4 | search_console | bing | cloudflare | google_ads | indexnow
  account_ref     text,
  property_ref    text,
  stream_ref      text,
  credentials     jsonb,           -- AES-256-GCM via app/lib/security/token-crypto.ts; never returned to client
  status          text default 'not_connected'
                  check (status in ('not_connected','connected_unverified','verified','error')),
  last_verified_at timestamptz,
  last_error      text,
  created_at      timestamptz default now(),
  unique (site_id, provider)
);

create table if not exists site_health_checks (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid references event_sites(id) on delete cascade not null,
  check_key   text not null,
  status      text not null check (status in ('pass','warn','fail')),
  detail      text,
  checked_at  timestamptz default now()
);
create index if not exists idx_health_site_time on site_health_checks(site_id, checked_at desc);

create table if not exists site_directory_listings (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid references event_sites(id) on delete cascade not null,
  directory    text not null,
  status       text default 'not_submitted'
               check (status in ('not_submitted','submitted','live','rejected')),
  listing_url  text,
  submitted_at timestamptz,
  notes        text
);
