-- ============================================================
--  Bespoke Tracker PRD expansion · 2026-07-13
--  Additive columns for Nic's 4 PRDs (Form wizard, Overview,
--  Tasks tab, Brief section). All nullable / defaulted so
--  existing rows keep working.
--  Run once against the live Supabase project.
-- ============================================================

-- ── PRD #1 · New Bespoke Project wizard ──────────────────────
alter table bespoke_projects
  add column if not exists webinar_platform      varchar(50),   -- Zoom | MS Teams | GoToWebinar | Webex | Other
  add column if not exists webinar_link          text,
  add column if not exists client_assets_url     text,
  add column if not exists commercial_lead_manual  varchar(255),
  add column if not exists marketing_lead_manual   varchar(255),
  add column if not exists delegate_lead_manual    varchar(255),
  add column if not exists operations_lead_manual  varchar(255);

-- ── PRD #4 · Brief section expansion ─────────────────────────
alter table bespoke_projects
  add column if not exists primary_goal          text,
  add column if not exists success_criteria      text,
  add column if not exists key_themes            text,
  add column if not exists desired_outcome       text,
  add column if not exists icp_job_titles        text[],
  add column if not exists icp_industries        text[],
  add column if not exists icp_geographies       text[],
  add column if not exists target_accounts_list  text,
  add column if not exists client_approver_name  varchar(100),
  add column if not exists client_approver_email varchar(255),
  add column if not exists speakers              jsonb default '[]'::jsonb,
  add column if not exists agenda                jsonb default '[]'::jsonb,
  add column if not exists registration_questions jsonb default '[]'::jsonb,
  add column if not exists brief_file_url        text,
  add column if not exists brief_is_locked       boolean not null default false;

-- Storage bucket for uploaded brief files (used by PRD #4 uploader).
-- Idempotent — create only if it doesn't exist. Public: false; access
-- goes through signed URLs from the server route.
insert into storage.buckets (id, name, public)
values ('bespoke-briefs', 'bespoke-briefs', false)
on conflict (id) do nothing;
