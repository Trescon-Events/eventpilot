/* The sessions a speaker is in, for the speaker page's Sessions tab. Pure helpers; the route does the reading. */

export type SpeakerSession = { id: string; title: string; stage: string | null; format: string | null; role: string | null; status: string; date: string; startHM: string; endHM: string; startsAt: string; endsAt: string }

/** Pairs of sessions that overlap in time (touching end-to-start is not a clash). Drafts count too: they are plans that will clash once published. */
export function findClashes(list: Pick<SpeakerSession, 'id' | 'startsAt' | 'endsAt'>[]): [string, string][] {
  const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const out: [string, string][] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], aEnd = new Date(a.endsAt).getTime()
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      if (new Date(b.startsAt).getTime() >= aEnd) break
      out.push([a.id, b.id])
    }
  }
  return out
}
