-- Guest invite: the code's own details, read from KonfHub when the link is saved (2026-10-06).
-- The delegate team creates the codes and sets their limits on KonfHub; EventPilot only reads
-- them (KonfHub's coupon export), so nobody types a limit here. guest_invite_used (existing)
-- holds KonfHub's own "Codes Used"; guest_invite_usage_checked_at is when it was read.
-- The earlier cap settings (events.guest_invite_cap, event_speakers.guest_invite_cap) are no
-- longer used and are left in place, unread.
ALTER TABLE event_speakers
  ADD COLUMN IF NOT EXISTS guest_invite_limit        integer,
  ADD COLUMN IF NOT EXISTS guest_invite_ticket_name  text,
  ADD COLUMN IF NOT EXISTS guest_invite_opens_at     timestamptz,
  ADD COLUMN IF NOT EXISTS guest_invite_expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS guest_invite_code_found   boolean;
