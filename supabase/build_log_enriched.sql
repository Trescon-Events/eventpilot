-- Build Log Enriched — AI-generated descriptions from GitHub commit diffs
-- Run once against the live Supabase project (yuyxfxoevztugtfgduks)

create table if not exists build_log_enriched (
  id            uuid        primary key default gen_random_uuid(),
  commit_sha    text        not null unique,
  author_email  text        not null,
  author_name   text        not null,
  committed_at  timestamptz not null,
  title         text        not null,
  bullets       text[]      not null default '{}',
  raw_message   text,
  created_at    timestamptz not null default now()
);

create index if not exists build_log_enriched_committed_idx on build_log_enriched(committed_at desc);
create index if not exists build_log_enriched_sha_idx       on build_log_enriched(commit_sha);
