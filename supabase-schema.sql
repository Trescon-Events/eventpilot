-- TAOS Discovery Platform — Supabase Schema
-- Run this in your Supabase SQL editor

-- Offices table (seeded with real targets)
create table offices (
  id text primary key,
  name text not null,
  city text not null,
  total_staff integer not null,
  color text not null
);

insert into offices (id, name, city, total_staff, color) values
  ('dubai',     'Dubai Office',     'Dubai',     15,  '#00A5A3'),
  ('bangalore', 'Bangalore Office', 'Bangalore', 91,  '#C0F43C'),
  ('mangalore', 'Mangalore Office', 'Mangalore', 15,  '#F4ED3C'),
  ('manipal',   'Manipal Office',   'Manipal',   63,  '#FF6B6B');

-- Staff members table
create table staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  office_id text references offices(id),
  department text,
  role text,
  profile_complete boolean default false,
  joined_at timestamp with time zone default now(),
  invite_token text unique default encode(gen_random_bytes(12), 'hex'),
  invited_by uuid references staff_members(id)
);

-- Admin users table
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_at timestamp with time zone default now()
);

-- Staff task profiles (filled after joining)
create table staff_task_profiles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  task_name text not null,
  task_description text,
  tools_used text[],
  time_taken_today text,
  frequency text,
  ai_time_estimate text,
  skill_needed text,
  ai_readiness integer check (ai_readiness between 1 and 5),
  created_at timestamp with time zone default now()
);

-- Email log
create table email_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id),
  email_type text,
  sent_at timestamp with time zone default now(),
  success boolean default true
);

-- RLS policies
alter table staff_members enable row level security;
alter table offices enable row level security;
alter table staff_task_profiles enable row level security;
alter table email_log enable row level security;

-- Anyone can read offices
create policy "offices_public_read" on offices for select using (true);

-- Anyone can insert a staff member (open join)
create policy "staff_public_insert" on staff_members for insert with check (true);

-- Anyone can read staff members (for counting)
create policy "staff_public_read" on staff_members for select using (true);

-- Staff can insert task profiles
create policy "tasks_public_insert" on staff_task_profiles for insert with check (true);
create policy "tasks_public_read" on staff_task_profiles for select using (true);

-- Realtime
alter publication supabase_realtime add table staff_members;
alter publication supabase_realtime add table staff_task_profiles;
