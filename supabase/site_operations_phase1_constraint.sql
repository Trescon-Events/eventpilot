-- Site Operations — optional hardening for Phase 1.
-- event_sites has no unique constraint on event_id; the Site Registry API
-- enforces "one row per event" itself (check-then-insert-or-update), so this
-- isn't required for the feature to work, but adds a DB-level guarantee
-- against a race between two concurrent saves creating duplicate rows.
-- Purely additive — safe on the current empty table.

alter table event_sites add constraint event_sites_event_id_key unique (event_id);
