// Public Name is what the public website (and every other public-facing
// surface — emails, promo creatives, KonfHub) should display for a speaker
// (2026-08-23, per Madhu) — `name` is just whatever the raw submission or
// bulk import happened to have. Same fallback shape as event.name's own
// public_name override. Normalize once, right after the query, so every
// consumer downstream keeps reading a plain `name` field.
export function withSpeakerPublicName<T extends { name: string; public_name?: string | null }>(
  rows: T[] | null | undefined
): Omit<T, 'public_name'>[] {
  return (rows ?? []).map(({ public_name, ...rest }) => ({ ...rest, name: public_name || rest.name }))
}
