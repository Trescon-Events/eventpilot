import { overlap, slug, toks } from './research'
import { sameName } from './lanes'
import { orgAgreement } from './pipeline'
import { countryCode } from './countries'

/* Scoring helpers for comparing research engines against a hand-checked answer key (the first Dubai Police deck). Pure functions only — the runner that calls the engines lives in .scratch.
   The question they answer: for each speaker, did the engine find the RIGHT person, and when it said "verified", was it actually right? */

export type Gold = { id: string; name: string; designation: string | null; organisation: string | null; linkedin: string | null; gold_country: string | null; bio: string }
export type EngineOut = {
  status: 'verified' | 'needs_review' | 'not_found'
  full_name: string | null; title: string | null; organization: string | null; linkedin_url: string | null
  nationality: string | null; nationality_iso2: string | null; bio: string | null
}
export { sameName }
export type Identity = 'correct' | 'wrong' | 'not_found'

/** Right person = the name agrees AND the organisation does not clearly differ. A matching name at a different organisation is a namesake: wrong. */
export function scoreIdentity(g: Gold, o: EngineOut): Identity {
  if (o.status === 'not_found' || !o.full_name) return 'not_found'
  if (!sameName(g.name, o.full_name)) return 'wrong'
  return orgAgreement(g.organisation, o.organization) === 'differs' && overlap(g.designation, o.title) === 'differs' ? 'wrong' : 'correct'
}

export const scoreTitle = (g: Gold, o: EngineOut) => overlap(g.designation, o.title) === 'match'
export const scoreOrg = (g: Gold, o: EngineOut) => orgAgreement(g.organisation, o.organization) === 'match'
export const scoreLinkedin = (g: Gold, o: EngineOut): 'match' | 'differs' | 'none' => !o.linkedin_url ? 'none' : slug(o.linkedin_url) && slug(o.linkedin_url) === slug(g.linkedin) ? 'match' : 'differs'
export function scoreCountry(g: Gold, o: EngineOut): 'match' | 'differs' | 'none' {
  const want = countryCode(g.gold_country), got = o.nationality_iso2 || countryCode(o.nationality)
  return !want || !got ? 'none' : want === got.toLowerCase() ? 'match' : 'differs'
}
/** Share of the gold bio's distinctive words that the engine's bio also carries — a rough recall measure; the model judge handles contradictions. */
export function bioRecall(g: Gold, o: EngineOut): number {
  const G = [...toks(g.bio)].filter(t => t.length > 4), O = toks(o.bio)
  return G.length ? G.filter(t => O.has(t)).length / G.length : 0
}

export type Row = { gold: Gold; out: EngineOut; identity: Identity; photoRight: boolean | null; secs?: number }
export type Summary = {
  n: number; correct: number; wrong: number; notFound: number
  verified: number; verifiedCorrect: number; falseConfidence: number; verifiedRecall: number
  titleOk: number; orgOk: number; linkedinOk: number; linkedinWrong: number; countryOk: number; countryWrong: number
  photoFound: number; photoWrong: number; bioWords: number; medianSecs: number | null
}
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function summarise(rows: Row[]): Summary {
  const c = rows.filter(r => r.identity === 'correct'), v = rows.filter(r => r.out.status === 'verified')
  const vc = v.filter(r => r.identity === 'correct')
  return {
    n: rows.length, correct: c.length, wrong: rows.filter(r => r.identity === 'wrong').length, notFound: rows.filter(r => r.identity === 'not_found').length,
    verified: v.length, verifiedCorrect: vc.length, falseConfidence: v.length - vc.length,
    verifiedRecall: c.length ? c.filter(r => r.out.status === 'verified').length / c.length : 0,
    titleOk: c.filter(r => scoreTitle(r.gold, r.out)).length, orgOk: c.filter(r => scoreOrg(r.gold, r.out)).length,
    linkedinOk: c.filter(r => scoreLinkedin(r.gold, r.out) === 'match').length, linkedinWrong: rows.filter(r => r.identity !== 'not_found' && scoreLinkedin(r.gold, r.out) === 'differs').length,
    countryOk: c.filter(r => scoreCountry(r.gold, r.out) === 'match').length, countryWrong: c.filter(r => scoreCountry(r.gold, r.out) === 'differs').length,
    photoFound: rows.filter(r => r.photoRight !== null).length, photoWrong: rows.filter(r => r.photoRight === false).length,
    bioWords: Math.round(median(rows.filter(r => r.out.bio).map(r => r.out.bio!.trim().split(/\s+/).length)) ?? 0),
    medianSecs: median(rows.map(r => r.secs).filter((x): x is number => typeof x === 'number')),
  }
}
