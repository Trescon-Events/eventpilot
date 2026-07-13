-- ============================================================
--  Finance Security Hardening · 2026-07-13
--  · Enable RLS + default-deny on salary tables
--  · Create salary_access_log audit table
--  Idempotent — safe to re-run.
-- ============================================================

-- ── Row Level Security on salary tables ─────────────────────
-- Service role bypasses RLS (all app-server calls go through
-- supabaseAdmin, so functional behaviour is unchanged). This
-- blocks direct table reads if anon/authenticated tokens are
-- ever used against these tables — defense-in-depth.

alter table if exists staff_salary_records enable row level security;

drop policy if exists "deny all direct client access on staff_salary_records" on staff_salary_records;
create policy "deny all direct client access on staff_salary_records"
  on staff_salary_records
  for all
  to authenticated, anon
  using (false)
  with check (false);

alter table if exists payroll_grades enable row level security;

drop policy if exists "deny all direct client access on payroll_grades" on payroll_grades;
create policy "deny all direct client access on payroll_grades"
  on payroll_grades
  for all
  to authenticated, anon
  using (false)
  with check (false);


-- ── Audit log for every salary/payroll read + write ─────────
-- Written by app/lib/finance/auth.ts::logFinanceAccess after
-- every successful auth pass. Never blocks the endpoint on
-- write failure. Read-only surface for admins in a follow-up UI.

create table if not exists salary_access_log (
  id              uuid          primary key default gen_random_uuid(),
  actor_id        uuid          references staff_members(id) on delete set null,
  actor_name      text,
  target_staff_id uuid          references staff_members(id) on delete set null,
  action          text          not null check (action in ('read','write','bulk_write','summary_read')),
  route           text          not null,
  is_admin        boolean       not null default false,
  ts              timestamptz   not null default now()
);

create index if not exists salary_access_log_ts_idx     on salary_access_log (ts desc);
create index if not exists salary_access_log_actor_idx  on salary_access_log (actor_id, ts desc);
create index if not exists salary_access_log_target_idx on salary_access_log (target_staff_id, ts desc);

alter table salary_access_log enable row level security;

drop policy if exists "deny all direct client access on salary_access_log" on salary_access_log;
create policy "deny all direct client access on salary_access_log"
  on salary_access_log
  for all
  to authenticated, anon
  using (false)
  with check (false);
