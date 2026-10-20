// Matches a pasted list of speaker names (the producers' "already shared" list) to an event's speakers. Case, accents, punctuation and
// extra spaces are ignored; both the Public Name and the full name are tried. A name matching more than one speaker is reported as
// ambiguous, never guessed.
export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(dr|mr|mrs|ms|prof|sir|h\.?e\.?)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

export type NameMatch = { input: string; status: 'matched' | 'unmatched' | 'ambiguous'; speaker_id?: string; speaker_name?: string; candidates?: string[] }

export function matchNames(names: string[], speakers: { id: string; name: string; public_name: string | null }[]): NameMatch[] {
  return names.map(raw => {
    const input = raw.trim()
    const key = normName(input)
    if (!key) return { input, status: 'unmatched' as const }
    const hits = speakers.filter(s => normName(s.public_name ?? '') === key || normName(s.name) === key)
    if (hits.length === 1) return { input, status: 'matched' as const, speaker_id: hits[0].id, speaker_name: hits[0].public_name || hits[0].name }
    if (hits.length > 1) return { input, status: 'ambiguous' as const, candidates: hits.map(h => h.public_name || h.name) }
    return { input, status: 'unmatched' as const }
  })
}
