-- Event Properties (2026-09-19, Madhu) — a genuinely shared, type-agnostic
-- pool of event-local custom fields, usable by speaker/sponsor/media_partner/
-- association_partner alike, without redefining the same field per type.
-- Additive alongside the existing event_form_schemas (per event+form_type) —
-- does NOT replace it. resolve-schema.ts merges these into every form
-- type's resolved schema automatically (append-only, never overrides a
-- base field with the same key), so an event with zero rows here behaves
-- byte-identical to today.

create table if not exists event_properties (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null default 'text',
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, key)
);

alter table event_properties enable row level security;
