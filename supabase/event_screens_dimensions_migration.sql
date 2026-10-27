-- Stage Screens: card sizes the branding team can adjust per event (Admin Console → Stage Speaker Pic → Card size),
-- and which card design the event uses ('separate' = photo with the details under it; 'card' = details inside one composed card, built next).
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS dims jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE event_screen_settings ADD COLUMN IF NOT EXISTS card_style text NOT NULL DEFAULT 'separate' CHECK (card_style IN ('separate', 'card'));
