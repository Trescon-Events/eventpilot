-- Event Website Template System
-- Replaces the JSONB-blob approach with proper relational tables.
-- Run in Supabase SQL editor (TAOS project).

-- ── 1. Website settings (one per event) ─────────────────────────────────────
create table if not exists event_websites (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade unique not null,
  slug            text unique not null,
  status          text not null default 'draft' check (status in ('draft','live')),
  template        text not null default 'vault',          -- future: 'vault' | 'summit' etc.

  -- Hero
  hero_headline      text,
  hero_subheadline   text,
  hero_bg_url        text,         -- Storage URL or external URL
  hero_video_url     text,         -- Background video URL (mp4)
  hero_cta_label     text default 'Register Now',
  hero_cta_url       text,

  -- About section (short paragraph)
  about_title        text,
  about_body         text,

  -- Stats bar
  stat_attendees     text,         -- e.g. "2000+"
  stat_speakers      text,
  stat_exhibitors    text,
  stat_countries     text,

  -- Venue info (shown in footer / venue section)
  venue_name         text,
  venue_city         text,
  venue_address      text,
  venue_date_display text,         -- e.g. "14–15 October 2025, Dubai"

  -- Theme (Vault 2047 palette by default)
  theme_primary   text not null default '#080A0C',
  theme_accent    text not null default '#E07B2C',
  theme_teal      text not null default '#00B4B0',

  -- KonfHub integration
  konfhub_event_id        text,
  konfhub_api_key         text,     -- store encrypted in real prod; fine for now
  konfhub_speaker_ticket  text,     -- ticket ID for speaker registration
  konfhub_partner_ticket  text,     -- ticket ID for partner/exhibitor

  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 2. Speakers ──────────────────────────────────────────────────────────────
create table if not exists event_speakers (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade not null,
  name            text not null,
  role            text,
  company         text,
  bio             text,
  photo_url       text,
  linkedin_url    text,
  tier            text default 'speaker'
                  check (tier in ('keynote','speaker','panelist','moderator')),
  session_title   text,
  status          text default 'approved'
                  check (status in ('pending','approved','rejected')),
  -- KonfHub fields (needed for push registration)
  email           text,
  phone           text,
  dial_code       text default '+971',
  country         text default 'UAE',
  konfhub_booking_id text,         -- populated after successful KonfHub push
  -- display
  order_index     integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

create index if not exists idx_event_speakers_event_id on event_speakers(event_id);

-- ── 3. Agenda ────────────────────────────────────────────────────────────────
create table if not exists event_agenda (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade not null,
  day             integer default 1,
  time_slot       text,
  title           text not null,
  description     text,
  speaker_name    text,
  type            text default 'session'
                  check (type in ('keynote','panel','workshop','fireside','networking','break','other')),
  track           text,
  order_index     integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

create index if not exists idx_event_agenda_event_id on event_agenda(event_id);

-- ── 4. Sponsors ──────────────────────────────────────────────────────────────
create table if not exists event_sponsors (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id) on delete cascade not null,
  name            text not null,
  tier            text default 'gold'
                  check (tier in ('platinum','gold','silver','bronze','media','association','government','startup')),
  logo_url        text,
  website_url     text,
  konfhub_booking_id text,
  order_index     integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

create index if not exists idx_event_sponsors_event_id on event_sponsors(event_id);

-- ── Auto-update updated_at on event_websites ─────────────────────────────────
create or replace function update_event_website_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_event_website_updated_at on event_websites;
create trigger trg_event_website_updated_at
  before update on event_websites
  for each row execute function update_event_website_updated_at();

-- ── Storage bucket for website image uploads ──────────────────────────────────
-- Run this once if bucket doesn't exist:
-- insert into storage.buckets (id, name, public) values ('event-website-assets', 'event-website-assets', true)
-- on conflict do nothing;
