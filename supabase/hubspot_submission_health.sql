-- HubSpot form sync health: one row per connected form, written by the 15-minute gap check
-- (app/lib/hubspot/submission-gap.ts). `since` is the go-live moment: nothing older is ever compared or brought in (forward-only).
create table if not exists hubspot_form_sync_health (
  hubspot_form_id text primary key,
  event_id uuid not null references events(id) on delete cascade,
  form_type text not null,
  since timestamptz not null default now(),
  checked_at timestamptz,
  check_error text,
  hubspot_count integer not null default 0,
  eventpilot_count integer not null default 0,
  gap jsonb not null default '[]'::jsonb,        -- [{ conversion_id, email, submitted_at, first_seen }]
  dismissed text[] not null default '{}',          -- conversion ids a person chose to ignore
  workflow_ok boolean,                             -- does the HubSpot workflow have its re-enrollment trigger?
  workflow_checked_at timestamptz,
  last_alert_at timestamptz,
  last_received_at timestamptz
);

-- Failed webhook deliveries (after the secret was accepted) — otherwise a rejected submission leaves no trace anywhere.
create table if not exists hubspot_webhook_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  hubspot_form_id text,
  stage text not null,
  message text not null
);
create index if not exists hubspot_webhook_errors_created_idx on hubspot_webhook_errors (created_at desc);

alter table hubspot_form_sync_health enable row level security;
alter table hubspot_webhook_errors enable row level security;
