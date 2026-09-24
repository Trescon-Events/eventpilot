// Single source of truth for "what's still missing from this speaker" —
// extracted from status-board/route.ts (2026-09-10) so the Status Board
// and the new Communications tab (per-speaker outstanding-items checklist
// + request compose) can never drift out of sync on what counts as
// missing. Mirrors the HubSpot onboarding form's own rule: National ID is
// only required alongside Passport for UAE residents — null (not yet
// determined) still counts as potentially needing it, so it isn't
// silently excused just because nobody's checked yet.

export type MissingItemKey = 'bio_full' | 'photo' | 'short_bio' | 'country' | 'passport' | 'national_id'
export type MissingItem = { key: MissingItemKey; label: string }

const LABELS: Record<MissingItemKey, string> = {
  bio_full: 'Full Bio',
  photo: 'Photo',
  short_bio: 'Short Bio',
  country: 'Country of Residence',
  passport: 'Passport',
  national_id: 'National ID',
}

export function computeMissingItems(
  speaker: { bio_full_url?: string | null; photo_url?: string | null; bio?: string | null; country?: string | null; is_uae_resident?: boolean | null },
  sensitiveDocTypes: Set<'passport' | 'national_id'>
): MissingItem[] {
  const items: MissingItem[] = []
  if (!speaker.bio_full_url) items.push({ key: 'bio_full', label: LABELS.bio_full })
  if (!speaker.photo_url) items.push({ key: 'photo', label: LABELS.photo })
  if (!speaker.bio?.trim()) items.push({ key: 'short_bio', label: LABELS.short_bio })
  // country has a DB default ('UAE') so an empty/null value only ever
  // happens for a row that genuinely never got one — a real default value
  // is treated as present, same presence-based philosophy as every other
  // field here (this never claims the default is *correct*, only that it
  // isn't blank).
  if (!speaker.country?.trim()) items.push({ key: 'country', label: LABELS.country })
  if (!sensitiveDocTypes.has('passport')) items.push({ key: 'passport', label: LABELS.passport })
  const nationalIdApplicable = speaker.is_uae_resident !== false
  if (nationalIdApplicable && !sensitiveDocTypes.has('national_id')) items.push({ key: 'national_id', label: LABELS.national_id })
  return items
}

export function missingItemLabel(key: MissingItemKey): string {
  return LABELS[key]
}
