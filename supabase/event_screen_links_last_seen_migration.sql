-- Stage / Table Screens: when did a private link's page last ask for its data (the AV page polls every 15 s). Lets the marketing page show "last seen 12 s ago" per link,
-- so a closed laptop or an asleep tab is noticed. Safe to run more than once; the code works (without the "last seen") until it is run.
ALTER TABLE event_screen_links ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
