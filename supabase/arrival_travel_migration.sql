-- Arrival & Travel module (2026-10-28): speakers give flight/arrival/departure details through a private link; a DET contact gets a live read-only view.
-- Per-event switch (event_travel_settings.enabled). Additive only.
begin;

create table if not exists event_travel_settings (
  event_id    uuid primary key references events(id) on delete cascade,
  enabled     boolean not null default false,
  deadline    date,
  det_name    text,
  det_email   text,
  det_token   text unique,
  det_sent_at timestamptz,
  updated_at  timestamptz not null default now()
);

create table if not exists speaker_travel (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  speaker_id    uuid not null unique references event_speakers(id) on delete cascade,
  token         text not null unique,
  no_reception  boolean not null default false,
  arr_flight    text,
  arr_class     text check (arr_class in ('first', 'business', 'economy')),
  arr_date      date,
  arr_time      text,
  dep_flight    text,
  dep_class     text check (dep_class in ('first', 'business', 'economy')),
  dep_date      date,
  dep_time      text,
  phone         text,
  submitted_by  text,
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  invited_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_speaker_travel_event on speaker_travel(event_id);

-- Who changed what and when (the link has no login, so the person types their name).
create table if not exists speaker_travel_log (
  id          uuid primary key default gen_random_uuid(),
  travel_id   uuid not null references speaker_travel(id) on delete cascade,
  by_name     text,
  summary     text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_speaker_travel_log_travel on speaker_travel_log(travel_id);

alter table event_travel_settings enable row level security;
alter table speaker_travel enable row level security;
alter table speaker_travel_log enable row level security;

commit;
