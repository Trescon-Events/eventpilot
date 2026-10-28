-- Who receives which kind of system alert. Managed only by the Super Admin (Admin > Super Admin).
-- A type with no rows falls back to the Super Admin, so an alert is never sent to nobody.
create table if not exists alert_recipients (
  alert_type text not null,
  staff_id uuid not null references staff_members(id) on delete cascade,
  email boolean not null default true,
  bell boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (alert_type, staff_id)
);
alter table alert_recipients enable row level security;
