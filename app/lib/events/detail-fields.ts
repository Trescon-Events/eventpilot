// Client-safe constants for the Event Details page's Common Detail fields
// — split out from detail-field-log.ts, which imports supabaseAdmin
// (server-only) and can't be pulled into a browser bundle. Both this file
// and detail-field-log.ts are the source of truth for the tracked field
// set; keep them in sync if either changes.

export type ChangeSource = 'manual' | 'ai_extraction'

export const TRACKED_EVENT_FIELDS = [
  'public_name', 'public_dates_display', 'public_venue_display',
  'website_url', 'registration_url', 'event_hashtag',
  'social_linkedin', 'social_x', 'social_instagram', 'social_facebook', 'social_youtube',
  'venue_map_url',
] as const
export type TrackedEventField = typeof TRACKED_EVENT_FIELDS[number]

// Shared human labels — used by the Event Details page's form and by the
// Messaging Doc chat's default_field proposals, so a field reads the same
// name in both places.
export const FIELD_LABELS: Record<TrackedEventField, string> = {
  public_name: 'Public Event Name',
  public_dates_display: 'Dates, as shown publicly',
  public_venue_display: 'Venue, as shown publicly',
  website_url: 'Event Website',
  registration_url: 'Registration URL',
  event_hashtag: 'Event Hashtag',
  social_linkedin: 'LinkedIn',
  social_x: 'X',
  social_instagram: 'Instagram',
  social_facebook: 'Facebook',
  social_youtube: 'YouTube',
  venue_map_url: 'Venue Map Link',
}
