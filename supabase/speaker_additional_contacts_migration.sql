-- Speaker Additional Contacts (2026-09-20, Madhu) — a small, per-speaker
-- pool of extra people a producer coordinates with about this speaker
-- (an assistant, their office, a family member, whoever) — deliberately
-- NOT typed as "assistant" specifically, since who it actually is varies
-- and the onboarding form is only ONE way this gets populated (the other
-- is a producer adding one directly from ongoing communication, which has
-- nothing to do with the form's own "assistant" fields at all).
--
-- Kept deliberately minimal per Madhu ("first name, last name and email
-- fields to keep it simple... name will mostly not be used, but email
-- will be used") — no phone, no role/label. Mirrors
-- event_client_approval_contacts' shape (supabase/
-- client_approval_contacts_migration.sql), same reasoning: a small,
-- producer-managed list of people, not a full contact record.
--
-- `source` distinguishes a contact auto-captured from the onboarding
-- form's assistant fields (only when the speaker actually opted in via
-- the "coordinate with your assistant" consent checkbox — see
-- speakers/from-submission/route.ts) from one a producer typed in
-- directly on the Details page — purely informational, nothing reads it
-- except the UI badge.
--
-- Every send-to-speaker composer (SendToSpeakerComposer,
-- SendForExternalApprovalComposer, NotifyExternalComposer) defaults its
-- CC list to every row here for that speaker — see those files' own
-- comments — so a producer stops retyping the same assistant's email on
-- every single communication.

create table if not exists speaker_additional_contacts (
  id uuid primary key default gen_random_uuid(),
  speaker_id uuid not null references event_speakers(id) on delete cascade,
  first_name text,
  last_name text,
  email text not null,
  source text not null default 'manual' check (source in ('manual', 'form')),
  created_at timestamptz not null default now()
);

create index if not exists idx_speaker_additional_contacts_speaker on speaker_additional_contacts(speaker_id);
