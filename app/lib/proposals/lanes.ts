import { GEMINI_PRO_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import { clean, gemini, norm, parseJson, type ProposalInput } from './research'
import { countryCode } from './countries'

/* Lane A — the single-pass engine's strength, kept as a second opinion inside the staged pipeline: one model call over the search-result snippets (titles, links, the text under each result)
   that were already fetched. Reading snippets finds people from thin evidence (a LinkedIn line, a conference page) that page-by-page reading can miss. It never gets to publish alone: the
   pipeline compares it with what the pages say, and anything it supplies by itself is capped at "needs review". */

const HONORIFIC = /^(dr|prof|professor|mr|mrs|ms|h|e|he|hh|sheikh|col|lt|colonel|general|brigadier|eng)$/
const nameTokens = (s: string | null | undefined) => norm((s ?? '').normalize('NFKD').replace(/\p{M}/gu, '')).split(' ').filter(t => t.length > 1 && !HONORIFIC.test(t))

/** Spelling variants of one name (Sigfusson/Sigfússon, Yacoub/Yagoub) and shortened first names (Kat/Katarzyna) count as the same token; other short tokens must be exact. */
function tokenClose(a: string, b: string): boolean {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 3 && l.startsWith(s)) return true
  if (s.length < 5) return false
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length] <= 1
}

/** Same person by name: every token of the shorter name appears in the longer one ("Hans Kluge" = "Dr Hans Henri P. Kluge"). Needs at least two tokens on each side. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const A = nameTokens(a), B = nameTokens(b)
  if (A.length < 2 || B.length < 2) return false
  const [short, long] = A.length <= B.length ? [A, B] : [B, A]
  const joined = long.join('') // Al Shehhi / Alshehhi: the same name split differently
  return short.every(t => long.some(l => tokenClose(t, l)) || (t.length >= 5 && joined.includes(t)))
}

export type LaneA = {
  identified: boolean; full_name: string | null; title: string | null; organization: string | null
  nationality: string | null; nationality_iso2: string | null; linkedin_index: number | null; bio: string | null; concerns: string[]
}
type Snip = { title: string; link: string; snippet: string }

export async function snippetHypothesis(input: ProposalInput, web: Snip[]): Promise<LaneA | null> {
  const list = web.slice(0, 20)
  if (!list.length) return null
  const prompt = `You are checking who a PROPOSED conference speaker is, from search-result snippets only. Wrong facts are embarrassing, so accuracy beats completeness. Use ONLY the snippets below, never your memory.

THE PERSON (as given by our team; may be messy or misspelled)
Name: ${clean(input.name)}
Designation: ${clean(input.designation) || '(not given)'}
Organisation: ${clean(input.company) || '(not given)'}
Country (team's): ${clean(input.country) || '(not given)'}

SEARCH RESULTS
${list.map((h, i) => `[W${i}] ${h.title} — ${h.link}\n    ${h.snippet}`).join('\n')}

Return JSON only:
{"identified": true only if the snippets clearly describe ONE person matching both the name AND the organisation or role (a namesake elsewhere is false),
 "full_name": "standard spelling used in the snippets",
 "title": "current job title per the snippets",
 "organization": "current organisation per the snippets",
 "nationality": "only if a snippet says it, else null",
 "linkedin_index": number of the W result that is this person's own linkedin.com/in profile, or null,
 "bio": "2-3 factual sentences using only the snippets, or null if they say too little",
 "concerns": ["ambiguity between several people, outdated title, anything doubtful"]}`
  try {
    const raw = await generateCopy(gemini().getGenerativeModel({ model: GEMINI_PRO_MODEL, generationConfig: COPY_GENERATION_CONFIG }), prompt, `proposal lane A ${clean(input.name)}`)
    const j = parseJson<Partial<LaneA> & { linkedin_index?: number | string | null }>(raw)
    if (!j) return null
    const li = j.linkedin_index == null ? null : Number(String(j.linkedin_index).replace(/\D/g, ''))
    return {
      identified: j.identified === true, full_name: clean(j.full_name) || null, title: clean(j.title) || null, organization: clean(j.organization) || null,
      nationality: clean(j.nationality) || null, nationality_iso2: countryCode(j.nationality), linkedin_index: li !== null && Number.isFinite(li) && li < list.length && /linkedin\.com\/in\//i.test(list[li].link) ? li : null,
      bio: clean(j.bio) || null, concerns: Array.isArray(j.concerns) ? j.concerns.map(String) : [],
    }
  } catch (e) { console.error('[proposals] lane A failed:', e instanceof Error ? e.message : e); return null }
}
