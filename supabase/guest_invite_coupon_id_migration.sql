-- Keep the KonfHub coupon id of auto-created guest codes so they can be removed again (KonfHub can only delete by id). 2026-10-12.
ALTER TABLE event_speakers ADD COLUMN IF NOT EXISTS guest_invite_coupon_id TEXT;
