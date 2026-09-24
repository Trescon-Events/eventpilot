-- event_speakers.country must only ever hold a value a person or a form
-- submission actually supplied. The old column default ('UAE') silently
-- filled it for every speaker added without one.
BEGIN;

ALTER TABLE event_speakers ALTER COLUMN country DROP DEFAULT;

-- Blank the auto-defaulted values on DFS: manually-added rows that still say
-- 'UAE' with no supporting signal (no is_uae_resident=true, no CRM country).
UPDATE event_speakers es
SET country = NULL
WHERE es.event_id = '293bde73-22c0-40f0-b621-6306c9266d6a'
  AND es.source = 'manual'
  AND es.country = 'UAE'
  AND es.is_uae_resident IS DISTINCT FROM true
  AND NOT EXISTS (
    SELECT 1 FROM crm_contacts c
    WHERE c.id = es.crm_contact_id AND COALESCE(c.property_values->>'country','') <> ''
  );

COMMIT;
