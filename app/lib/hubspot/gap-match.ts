/* Which HubSpot submissions has EventPilot not received? Pure, so it is unit-tested (gap-match.test.ts). Used by the Sync health check (submission-gap.ts).
   Matching is by email and count, sharpened two ways so a submission that DID arrive is never reported as missing:
   1. HubSpot's conversion id is inside the file links EventPilot stores with a row (…conversionId=<id>…), so a submission whose id appears there is delivered, whatever its position.
   2. A person who submits twice within an hour: HubSpot's workflow sends the contact's CURRENT details for both runs, so the second delivery is identical and the duplicate guard rightly
      drops it. The older submission is then covered by the newer one that arrived, and is not a gap. */

export type HsSub = { conversionId: string; submittedAt: number }
export type EpRow = { email: string; conversionIds: string[] }
export const SUPERSEDED_WITHIN_MS = 60 * 60 * 1000

/** conversion ids found in a row's file links. */
export function conversionIdsIn(fileUrls: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(/conversionId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)) out.push(m[1].toLowerCase())
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk)
  }
  walk(fileUrls)
  return out
}

export function findGap<T extends HsSub>(hsByEmail: Map<string, T[]>, epRows: EpRow[]): { email: string; sub: T }[] {
  const gap: { email: string; sub: T }[] = []
  const rowsBy = new Map<string, EpRow[]>()
  for (const r of epRows) rowsBy.set(r.email, [...(rowsBy.get(r.email) ?? []), r])
  for (const [email, list] of hsByEmail) {
    const rows = rowsBy.get(email) ?? []
    const known = new Set(rows.flatMap(r => r.conversionIds.map(c => c.toLowerCase())))
    const delivered = list.filter(s => known.has(s.conversionId.toLowerCase()))
    const covered = (s: T) => delivered.some(d => d.submittedAt > s.submittedAt && d.submittedAt - s.submittedAt <= SUPERSEDED_WITHIN_MS)
    const remaining = list.filter(s => !delivered.includes(s) && !covered(s))
    const rowsLeft = Math.max(0, rows.length - delivered.length)
    const missing = remaining.length - rowsLeft
    if (missing <= 0) continue
    // The newest submissions are the ones assumed missing (an older one is more likely to have been delivered already).
    for (const s of [...remaining].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, missing)) gap.push({ email, sub: s })
  }
  return gap
}
