-- Logistics: who is told (bell + email) when a speaker submits or changes travel details, chosen by name per event. Additive only.
alter table event_travel_settings add column if not exists notify_staff_ids uuid[] not null default '{}';
