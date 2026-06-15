-- Platform Reviews — staff feedback on toolkit tools
-- Run once against the live Supabase project (yuyxfxoevztugtfgduks)

create table if not exists platform_reviews (
  id                uuid        primary key default gen_random_uuid(),
  staff_id          uuid        references staff_members(id) on delete set null,
  staff_name        text        not null,
  staff_email       text        not null,
  tool              text        not null,   -- smart_data | hr_portal | events | intelligence | finance | brand_studio | website_builder | content
  review_type       text        not null,   -- bug | not_working | suggestion | improvement
  severity          text        not null default 'medium', -- critical | high | medium | low
  title             text        not null,
  description       text        not null,
  status            text        not null default 'new',    -- new | acknowledged | in_progress | resolved | wont_fix
  admin_notes       text,
  resolved_at       timestamptz,
  resolved_by_name  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Index for admin list queries
create index if not exists platform_reviews_status_idx  on platform_reviews(status);
create index if not exists platform_reviews_tool_idx    on platform_reviews(tool);
create index if not exists platform_reviews_created_idx on platform_reviews(created_at desc);

-- Auto-update updated_at
create or replace function update_platform_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists platform_reviews_updated_at on platform_reviews;
create trigger platform_reviews_updated_at
  before update on platform_reviews
  for each row execute function update_platform_reviews_updated_at();
