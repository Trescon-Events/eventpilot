import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import { gemini, parseJson, norm, clean, type ProposalInput } from './research'
import { domainOf, type FetchedPage } from './pages'

/* Speaker Proposals — a "source reader": one small, cheap AI call that reads ONE page and reports back in a fixed form. Many run in parallel; the
   consolidator then merges their reports. A reader never decides anything about the person overall — it only says what THIS page shows, with proof.
   Every quote it returns is checked against the page text in code, so a reader cannot invent evidence. */

export type SourceReport = {
  url: string; title: string; domain: string; authority: number; page_date: string | null
  about: 'yes' | 'maybe' | 'no'; match_quote: string | null
  person_title: string | null; organization: string | null; nationality: string | null
  bio_excerpt: string | null; facts: { claim: string; quote: string }[]
  photos: { url: string; alt: string; why: string }[]
  notes: string | null
}

const wordSet = (s: string) => new Set(norm(s).split(' ').filter(w => w.length > 2))
/** How much of `snippet` (as words) actually occurs in `page`: 1 = every word is there. Cheap guard against invented quotes. */
export function coverage(snippet: string, page: string): number {
  const a = [...wordSet(snippet)]; if (!a.length) return 0
  const b = wordSet(page)
  return a.filter(w => b.has(w)).length / a.length
}
export const quoteIsReal = (quote: string, page: string): boolean => {
  const q = norm(quote); if (q.length < 12) return false
  return norm(page).includes(q) || coverage(quote, page) >= 0.9
}

type Raw = { about?: string; match_quote?: string | null; title?: string | null; organization?: string | null; nationality?: string | null; bio_excerpt?: string | null; facts?: { claim?: string; quote?: string }[]; photo_indexes?: { i: number; why?: string }[]; page_date?: string | null; notes?: string | null }

export async function readSource(input: ProposalInput, page: FetchedPage, authority: number): Promise<SourceReport | null> {
  const imgs = page.images.slice(0, 18)
  const imgList = imgs.map((m, i) => `[${i}] ${m.kind === 'og' ? '(page share image) ' : ''}${m.url.split('/').slice(-2).join('/')} | alt: ${m.alt || '-'} | near: ${m.near || '-'}`).join('\n')
  const prompt = `You are a source reader. Read ONE web page and report what it shows about a specific proposed conference speaker. Return JSON only.

THE PERSON (from our sheet; may be misspelled or incomplete)
Name: ${clean(input.name)} | Designation: ${clean(input.designation) || '-'} | Organisation: ${clean(input.company) || '-'}

PAGE: ${page.url}
Title: ${page.title}

PAGE TEXT
${page.markdown}

IMAGES ON THE PAGE
${imgList || '(none)'}

Rules:
- "about": "yes" ONLY if the page text clearly describes THIS person (name AND organisation or role match). "maybe" if the name matches but you cannot tell it is the same person. "no" if it is about someone else (even with the same name) or doesn't mention them.
- "match_quote": the shortest exact phrase copied from the page that shows the name together with their role/organisation. Null if none.
- "title" / "organization": their role and employer AS THIS PAGE states them (current, not past). Null if not stated.
- "nationality": only if the page says it. Null otherwise.
- "bio_excerpt": up to 160 words of the page's own biography text about them, COPIED WORD FOR WORD (you may drop sentences, never reword). Null if the page has no biography of them.
- "facts": up to 8 short factual claims about THEM (roles held, years, education, awards, achievements), each with "quote" copied exactly from the page.
- "photo_indexes": the images (by number) that are a headshot/portrait of THIS person: the image sits next to their name or role, or its alt text names them. NOT logos, event banners, share images, or other people. Empty if none. Give "why" in a few words.
- "page_date": the date the page was published or updated (YYYY-MM-DD) if shown, else null.
- "notes": anything a human should know (e.g. page is old, bio is for a different role).
Never use outside knowledge. Only the page.
{"about":"","match_quote":null,"title":null,"organization":null,"nationality":null,"bio_excerpt":null,"facts":[{"claim":"","quote":""}],"photo_indexes":[{"i":0,"why":""}],"page_date":null,"notes":null}`
  let raw: Raw | null
  try {
    const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
    raw = parseJson<Raw>(await generateCopy(model, prompt, `proposal reader ${domainOf(page.url)}`))
  } catch (e) { console.error('[proposals] reader failed for', page.url, e instanceof Error ? e.message : e); return null }
  if (!raw) return null
  const about = raw.about === 'yes' || raw.about === 'maybe' ? raw.about : 'no'
  const text = page.markdown
  const matchQuote = raw.match_quote && quoteIsReal(raw.match_quote, text) ? raw.match_quote.trim() : null
  // "yes" needs proof: a real quote from the page. Without it the claim is downgraded.
  const aboutChecked: SourceReport['about'] = about === 'yes' && !matchQuote ? 'maybe' : about
  const bio = raw.bio_excerpt && coverage(raw.bio_excerpt, text) >= 0.85 ? raw.bio_excerpt.trim() : null
  const facts = (raw.facts ?? []).filter(f => f.claim && f.quote && quoteIsReal(f.quote, text)).slice(0, 8).map(f => ({ claim: f.claim!.trim(), quote: f.quote!.trim() }))
  const photos = aboutChecked === 'no' ? [] : (raw.photo_indexes ?? []).filter(p => Number.isInteger(p.i) && p.i >= 0 && p.i < imgs.length).slice(0, 3).map(p => ({ url: imgs[p.i].url, alt: imgs[p.i].alt, why: (p.why ?? '').slice(0, 80) }))
  return {
    url: page.url, title: page.title, domain: page.domain, authority, page_date: raw.page_date && /^\d{4}-\d{2}-\d{2}/.test(raw.page_date) ? raw.page_date.slice(0, 10) : page.date,
    about: aboutChecked, match_quote: matchQuote, person_title: aboutChecked === 'no' ? null : raw.title?.trim() || null, organization: aboutChecked === 'no' ? null : raw.organization?.trim() || null,
    nationality: raw.nationality?.trim() || null, bio_excerpt: aboutChecked === 'no' ? null : bio, facts: aboutChecked === 'no' ? [] : facts, photos, notes: raw.notes?.trim() || null,
  }
}
