-- Run this in Supabase SQL Editor

create table if not exists intelligence_reports (
  id               uuid        primary key default gen_random_uuid(),
  generated_at     timestamptz not null default now(),
  total_submissions int         not null default 0,
  trigger_type     text        not null default 'manual' check (trigger_type in ('manual', 'cron')),
  report           jsonb       not null
);

-- Most recent first
create index if not exists intelligence_reports_generated_at_idx
  on intelligence_reports (generated_at desc);

-- Service role only — no public reads
alter table intelligence_reports enable row level security;
