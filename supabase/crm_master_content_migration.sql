-- CRM layer — Phase 2 addition: master/default reusable content fields.
--
-- Bio and the cleaned (background-removed) photo are "mostly common" for a
-- speaker across events, same for a company's description and logo — but
-- they are NOT a live reference every event reads from. Each is captured
-- as a stable baseline the FIRST time a contact/company is created in the
-- CRM, and deliberately never overwritten by later event submissions (see
-- app/lib/crm/upsert.ts's setCrmContactPhotoIfEmpty/setCrmCompanyLogoIfEmpty
-- and the create-only bio/description seeding) — editing a bio for one
-- event's context must never silently change it everywhere else.
-- event_speakers/event_sponsors keep their own independently-editable
-- per-event copies exactly as before; this is additive, not a replacement.

BEGIN;

ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMIT;
