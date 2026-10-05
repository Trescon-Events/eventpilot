-- Explicit HubSpot Event link per EventPilot event (2026-10-05). EventPilot is
-- READ-ONLY toward HubSpot Events: the CRM sync used to find-or-CREATE an
-- Events record by exact name, which created duplicates whenever the names
-- differed even by an invisible character. The sync now uses ONLY the Event a
-- person selected on the event's Integrations tab (stored here) and never
-- creates one; with no link it skips the Contact/Company -> Event association.
-- hubspot_event_name is display-only. Additive; nothing is auto-filled.
ALTER TABLE events ADD COLUMN IF NOT EXISTS hubspot_event_id   text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS hubspot_event_name text;
