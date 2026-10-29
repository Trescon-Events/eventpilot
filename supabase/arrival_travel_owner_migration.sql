-- Logistics: one owner per event. The owner is notified (bell + email) of every speaker submission, and the DET email is sent from the owner's own mailbox and signed by them. Additive only.
alter table event_travel_settings add column if not exists owner_staff_id uuid references staff_members(id) on delete set null;
-- Carry over the first person already chosen in the notify list, if any.
update event_travel_settings set owner_staff_id = notify_staff_ids[1] where owner_staff_id is null and coalesce(array_length(notify_staff_ids, 1), 0) > 0;
