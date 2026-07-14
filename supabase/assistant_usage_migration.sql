-- Per-user daily usage counter for the Knowledge Assistant (/api/kb/bd-chat).
-- One row per staff member per day; server increments `count` on every
-- accepted message and rejects once count >= the caller's daily cap.
create table if not exists assistant_usage (
  staff_id    uuid not null,
  usage_date  date not null default current_date,
  count       int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (staff_id, usage_date)
);
