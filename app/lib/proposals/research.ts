import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import { countryCode } from './countries'
import { fetchBranding, fetchPageText, imageSearch, videoSearch, webSearch, type ImageHit, type VideoHit } from './search'

/* Speaker Proposals — research one candidate in three independent passes.
   Pass 1 (Gemini Pro): searches the web, reads the best pages, identifies the person and fills the card (title, nationality, LinkedIn, bio, videos, photo + logo candidates).
   Pass 2 (OpenAI, blind): its own searches from the name + organisation only — it never sees pass 1's answer — and reports the same key facts.
   Pass 3 (Gemini Flash): checks the pass-1 bio sentence by sentence against the sources and drops anything the sources don't support.
   The comparison is done in code: facts that don't agree are flagged for a human, never averaged. Links and image URLs only ever come from real search results (the models pick by index). */

import type { ProposalFile } from './files'
export type ProposalInput = { name: string; designation: string | null; company: string | null; country: string | null; linkedin: string | null; track: string | null; website?: string | null; extra?: string | null; links?: string | null; files?: ProposalFile[] | null }
export type CardVideo = { url: string; title: string; channel: string | null; date: string | null; duration: string | null; thumbnail: string | null; checked: 'watched' | 'named' | null; evidence: string | null }
export type Candidate = { url: string; page_url: string | null; title: string }
export type Agreement = 'match' | 'differs' | 'unknown'
export const normalizeUrl = (s: string | null | undefined): string | null => { const u = (s ?? '').trim(); if (!u) return null; const full = /^https?:\/\//i.test(u) ? u : `https://${u}`; try { return new URL(full).hostname.includes('.') ? full : null } catch { return null } }
export type ResearchResult = {
  identified: boolean; confidence: number
  full_name: string | null; title: string | null; organization: string | null; org_website: string | null
  nationality: string | null; nationality_iso2: string | null
  linkedin_url: string | null; linkedin_note: string | null
  bio: string | null; bio_words: number; bio_removed: string[]
  videos: CardVideo[]; photo_candidates: Candidate[]; logo_candidates: Candidate[]
  sources: { url: string; title: string; gave?: string[] }[]
  verification: { pass2_identified: boolean | null; title: Agreement; organization: Agreement; nationality: Agreement; linkedin: Agreement; pass2: Record<string, unknown> | null }
  status: 'verified' | 'needs_review' | 'not_found'
  concerns: string[]
}

let _gemini: GoogleGenerativeAI | null = null
export const gemini = () => (_gemini ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY!))
export const words = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length
export const clean = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '').trim()
export const norm = (s: string | null | undefined) => clean(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['of', 'the', 'and', 'for', 'at', 'in', 'to', 'a', 'an', 'senior', 'sr', 'vice', 'vp', 'chief', 'officer', 'director', 'head'])
export const toks = (s: string | null | undefined) => new Set(norm(s).split(' ').filter(t => t.length > 1 && !STOP.has(t)))
export function overlap(a: string | null | undefined, b: string | null | undefined): Agreement {
  const A = toks(a), B = toks(b)
  if (!A.size || !B.size) return 'unknown'
  const inter = [...A].filter(t => B.has(t)).length
  return inter / Math.min(A.size, B.size) >= 0.5 ? 'match' : 'differs'
}
export const slug = (u: string | null | undefined) => (u ?? '').toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/)?.[1]?.replace(/%[0-9a-f]{2}/g, '') ?? null
/** Reads model JSON. Models sometimes wrap a single answer in a list ( [ {…} ] ) — that is unwrapped, so callers always get the object. */
export const parseJson = <T,>(raw: string): T | null => {
  try {
    const v = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as unknown
    return (Array.isArray(v) && v.length >= 1 && v[0] && typeof v[0] === 'object' && !Array.isArray(v[0]) ? v[0] : v) as T
  } catch { return null }
}

// Order shown on the card: YouTube, then other video platforms, then ordinary websites, then Instagram/Facebook/TikTok reels.
export const WATCHABLE_FIRST = (u: string) => /youtube\.com|youtu\.be/i.test(u) ? 0 : /vimeo\.com|dailymotion\.com|ted\.com|twitch\.tv/i.test(u) ? 1 : /instagram\.com|facebook\.com|fb\.watch|tiktok\.com/i.test(u) ? 4 : 2
export const NOT_VIDEO = /linkedin\.com\//i // LinkedIn posts sit behind a sign-in wall
export const BAD_IMAGE_HOST = /licdn\.com|fbcdn\.net|cdninstagram\.com|lookaside\.instagram\.com|gstatic\.com|encrypted-tbn/i
/** Same title = same video, whatever the URL (sites often publish one interview under two paths). */
export const titleKey = (t: string) => norm(t).slice(0, 48)
export function rankVideos(list: VideoHit[]): VideoHit[] {
  const seen = new Set<string>()
  return list.filter(v => !NOT_VIDEO.test(v.url)).sort((a, b) => WATCHABLE_FIRST(a.url) - WATCHABLE_FIRST(b.url)).filter(v => { const k = titleKey(v.title); if (seen.has(k)) return false; seen.add(k); return true })
}
/** A YouTube link must be public; other platforms are only checked to respond. */
export async function opensFine(url: string): Promise<boolean> {
  try {
    if (/youtube\.com|youtu\.be/i.test(url)) return (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000) })).ok
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventPilot link check)' } })
    return r.status < 400
  } catch { return false }
}

/** The distinctive part of a name: its last word of 3+ letters, ignoring titles. */
export const TITLE_WORDS = /^(mr|mrs|ms|dr|prof|professor|eng|h\.?e|hh|sheikh|major|general|brigadier|colonel|lt|col|captain|first|1st|lieutenant|his|her|excellency)\.?$/i
export function surnameOf(name: string): string | null {
  const parts = clean(name).split(' ').filter(w => !TITLE_WORDS.test(w) && w.length >= 3)
  return parts.length ? norm(parts[parts.length - 1]) : null
}
export const mentions = (text: string, token: string | null) => !!token && norm(text).split(' ').includes(token)
export const minutes = (d: string | null) => { const m = (d ?? '').match(/^(?:(\d+):)?(\d+):(\d+)$/); return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) + Number(m[3]) / 60 : null }

/** Gemini watches a public YouTube video and says whether this person really speaks or appears in it. Null when it can't be checked. */
export async function watchCheck(url: string, name: string, role: string): Promise<{ appears: boolean; evidence: string } | null> {
  try {
    const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: { responseMimeType: 'application/json', mediaResolution: 'MEDIA_RESOLUTION_LOW' } as unknown as GenerationConfig })
    const r = await model.generateContent([{ fileData: { fileUri: url, mimeType: 'video/mp4' } }, { text: `Does the person named ${name}, who is ${role}, speak or appear in this video? Say true only if they are introduced by name AND the role or organisation given in the video matches (spoken or on-screen caption). A different person with the same name, or the same name with a different job or employer, is false. Return JSON {"appears":true|false,"evidence":"how you know, with a rough timestamp"}.` }] as never, { timeout: 70_000 })
    const j = parseJson<{ appears?: boolean; evidence?: string }>(r.response.text())
    return j ? { appears: j.appears === true, evidence: String(j.evidence ?? '') } : null
  } catch (e) { console.error('[proposals] watch check failed:', e instanceof Error ? e.message : e); return null }
}

export function uniqBy<T>(list: T[], key: (t: T) => string): T[] { const seen = new Set<string>(); return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true }) }

/** Searches shared by pass 1: web, videos, images. */
export async function gather(input: ProposalInput, queries: { web: string[]; video: string[]; image: string[] }) {
  const settle = async <T,>(p: Promise<T[]>): Promise<T[]> => { try { return await p } catch (e) { console.error('[proposals] search failed:', e instanceof Error ? e.message : e); return [] } }
  const [web, video, image] = await Promise.all([
    Promise.all(queries.web.map(q => settle(webSearch(q, 8)))).then(r => uniqBy(r.flat(), x => x.link)),
    Promise.all(queries.video.map(q => settle(videoSearch(q, 10)))).then(r => uniqBy(r.flat(), x => x.url)),
    Promise.all(queries.image.map(q => settle(imageSearch(q, 8)))).then(r => uniqBy(r.flat(), x => x.imageUrl)),
  ])
  return { web, video, image }
}

export const who = (i: ProposalInput) => `${clean(i.name)}${i.company ? ` ${clean(i.company)}` : ''}`

export async function researchCandidate(input: ProposalInput): Promise<ResearchResult> {
  const concerns: string[] = []
  const org = clean(input.company)
  const surname = surnameOf(input.name)
  // ── Pass 1 ──────────────────────────────────────────────────────────────
  const q1 = {
    web: [`"${clean(input.name)}" ${org}`, `"${clean(input.name)}" ${org} linkedin`, `"${clean(input.name)}" ${clean(input.designation)} biography`],
    video: [`"${clean(input.name)}" ${org}`, `"${clean(input.name)}" speech OR keynote OR interview OR panel`, `${clean(input.name)} ${org} youtube`],
    image: [`"${clean(input.name)}" ${org}`],
  }
  const g1 = await gather(input, q1)
  g1.video = rankVideos(g1.video)
  g1.image = g1.image.filter(m => !BAD_IMAGE_HOST.test(m.imageUrl) && (m.width === null || m.width >= 250) && mentions(`${m.title} ${m.pageUrl} ${m.imageUrl.replace(/[-_./%]/g, ' ')}`, surname))
  const logoImgs = org ? await imageSearch(`${org} official logo`, 6).catch(() => [] as ImageHit[]) : []
  const pageTargets = g1.web.filter(h => !/linkedin\.com|youtube\.com/i.test(h.link)).slice(0, 4)
  const pages = (await Promise.all(pageTargets.map(async h => ({ hit: h, text: await fetchPageText(h.link) })))).filter(p => p.text)

  // What the producer told us (the sheet can't know it): free text — often pasted LinkedIn text or a bio — plus any pages they linked and the company website.
  const extraText = (input.extra ?? '').trim().slice(0, 12000)
  const producerUrls = uniqBy([...(extraText.match(/https?:\/\/[^\s)>\]"']+/g) ?? []), ...(normalizeUrl(input.website) ? [normalizeUrl(input.website)!] : [])].filter(u => !/linkedin\.com/i.test(u)).map(u => ({ u })), x => x.u).slice(0, 4)
  const producerPages = (await Promise.all(producerUrls.map(async x => ({ url: x.u, text: await fetchPageText(x.u, 6000) })))).filter(x => x.text)
  const producerBlock = extraText || producerPages.length ? `PRODUCER-PROVIDED INFORMATION (our producer vouches for who this person is; treat as a source for identity and facts. It may contain text pasted from the person's LinkedIn profile):
${extraText || '(none)'}
${producerPages.map((p, i) => `[Q${i}] ${p.url}\n${p.text}`).join('\n\n')}

` : ''
  const webList = g1.web.slice(0, 14).map((h, i) => `[W${i}] ${h.title} — ${h.link}\n    ${h.snippet}`).join('\n')
  const pageList = pages.map((p, i) => `[P${i}] ${p.hit.title} — ${p.hit.link}\n${p.text}`).join('\n\n')
  const videoList = g1.video.slice(0, 14).map((v, i) => `[V${i}] ${v.title} | ${v.channel ?? '?'} | ${v.date ?? '?'} | ${v.duration ?? '?'} — ${v.url}${v.snippet ? `\n    ${v.snippet}` : ''}`).join('\n')
  const imageList = g1.image.slice(0, 8).map((m, i) => `[I${i}] ${m.title} (page: ${m.pageUrl})`).join('\n')
  const logoList = logoImgs.filter(m => !BAD_IMAGE_HOST.test(m.imageUrl)).map((m, i) => `[L${i}] ${m.title} (page: ${m.pageUrl})`).join('\n')

  const prompt1 = `You are a careful research analyst preparing a one-card profile of a PROPOSED conference speaker for a police-led summit. Wrong facts are embarrassing, so accuracy beats completeness. Use ONLY the material below — never your own memory.

THE PERSON (as given by our team; may be messy or misspelled)
Name: ${clean(input.name)}
Designation: ${clean(input.designation) || '(not given)'}
Organisation: ${org || '(not given)'}
Country (as given by our team — this is the NATIONALITY we intend to show on the card): ${clean(input.country) || '(not given)'}
LinkedIn (as given): ${input.linkedin || '(none)'}

${producerBlock}WEB RESULTS
${webList || '(none)'}

PAGE TEXT
${pageList || '(none)'}

VIDEO RESULTS
${videoList || '(none)'}

PERSON PHOTO RESULTS
${imageList || '(none)'}

ORGANISATION LOGO RESULTS
${logoList || '(none)'}

TASK — return JSON only:
{
 "identified": true|false,        // true only if the sources clearly show ONE person who matches the name AND the organisation/designation. Information supplied by the producer that describes this person counts as identifying them
 "confidence": 0-1,
 "full_name": "correct full name with the standard spelling used by the sources, no titles unless part of how they are formally addressed (e.g. Major General)",
 "title": "current job title",
 "organization": "current organisation (parent body, not a sub-unit, unless the sub-unit IS the employer)",
 "org_website": "organisation's main web domain, e.g. visa.com, or null",
 "nationality": "country name. Use what the sources say; if the sources are silent, use the country our team gave. Never use where they merely work or live",
 "nationality_iso2": "ISO 3166-1 alpha-2 of that nationality, or null",
 "nationality_basis": "sources" | "team" | null,   // 'team' = only our team's country, not confirmed by a source; if the sources point to a DIFFERENT nationality than the team's, use the sources' and say so in concerns
 "linkedin_index": "W index of the personal LinkedIn profile (linkedin.com/in/…) that belongs to this person, or null. If the given LinkedIn looks like a different person or a company page, do not use it and explain in linkedin_note",
 "linkedin_note": "short note if anything about LinkedIn is doubtful, else null",
 "bio": "about 120 words (100-130), third person, neutral and factual, plain words, no hype adjectives (no renowned/leading/visionary). Open with who they are and their current role. Every sentence must be supported by the sources above. Use present tense for the current role only if the sources show it is current. If the sources do not support a bio of this length, write less — never pad or guess.",
 "bio_sources": ["W, P or Q indexes the bio is drawn from (use X if drawn from the producer-provided text)"],
 "video_indexes": ["up to 3 V indexes, STRICT: include a video only if its title or snippet names this person, or it is clearly their own organisation's official channel about them. A video about a topic, an operation, or someone with a similar name is NOT enough. Zero is a perfectly good answer. Prefer YouTube/Vimeo/broadcaster channels and talks over short social reposts; most recent first among equals"],
 "photo_indexes": ["up to 3 I indexes whose page is clearly about this person"],
 "logo_indexes": ["up to 2 L indexes that are the organisation's official logo or emblem"],
 "concerns": ["anything a human should double-check: ambiguity between several people, a title that may be outdated, conflicting sources, a name spelling that differs from the sources, etc."]
}`
  const model1 = gemini().getGenerativeModel({ model: GEMINI_PRO_MODEL, generationConfig: COPY_GENERATION_CONFIG })
  const raw1 = await generateCopy(model1, prompt1, `proposal research ${clean(input.name)}`)
  type P1 = { nationality_basis?: string | null; identified?: boolean; confidence?: number; full_name?: string | null; title?: string | null; organization?: string | null; org_website?: string | null; nationality?: string | null; nationality_iso2?: string | null; linkedin_index?: string | null; linkedin_note?: string | null; bio?: string | null; bio_sources?: string[]; video_indexes?: string[]; photo_indexes?: string[]; logo_indexes?: string[]; concerns?: string[] }
  const p1 = parseJson<P1>(raw1)
  if (!p1) throw new Error('The research model returned something unreadable.')
  const idx = (s: string | null | undefined, prefix: string) => { const m = String(s ?? '').match(new RegExp(`^\\[?${prefix}(\\d+)\\]?$`)); return m ? Number(m[1]) : null }
  const pick = <T,>(list: T[], ids: string[] | undefined, prefix: string, max: number): T[] => (ids ?? []).map(s => idx(s, prefix)).filter((n): n is number => n !== null && n < list.length).slice(0, max).map(n => list[n])

  const linkedinHit = idx(p1.linkedin_index, 'W') !== null ? g1.web[idx(p1.linkedin_index, 'W')!] : null
  const linkedinUrl = linkedinHit && /linkedin\.com\/in\//i.test(linkedinHit.link) ? linkedinHit.link.split('?')[0] : null
  const personText = (v: VideoHit) => `${v.title} ${v.snippet ?? ''} ${v.channel ?? ''}`
  const firstName = norm(clean(p1.full_name ?? input.name).split(' ').filter(w => !TITLE_WORDS.test(w))[0] ?? '')
  const ctxTokens = [...toks(`${p1.organization ?? ''} ${org}`), ...toks(p1.title ?? input.designation)].filter(t => t.length > 3)
  // A name alone is not enough (the actor Stephen Fry is not the INTERPOL official): without watching it, the text must also carry their organisation or role.
  const strongNamed = (v: VideoHit) => { const t = norm(personText(v)).split(' '); return mentions(personText(v), surname) && mentions(personText(v), firstName) && ctxTokens.some(c => t.includes(c)) }
  const modelPicks = pick(g1.video, p1.video_indexes, 'V', 4)
  // Candidates to verify: the model's picks plus the best YouTube/Vimeo results, so a good talk isn't lost just because its title doesn't carry the name.
  const pool = uniqBy([...modelPicks, ...g1.video.filter(v => WATCHABLE_FIRST(v.url) <= 1).slice(0, 5)], v => v.url).slice(0, 7)
  const role = `${p1.title ?? input.designation ?? ''}, ${p1.organization ?? org}`
  const checks = await Promise.all(pool.map(async (v, i) => {
    if (!(await opensFine(v.url))) return null
    const isYt = /youtube\.com|youtu\.be/i.test(v.url), len = minutes(v.duration)
    if (isYt && i < 5 && (len === null || len <= 60)) {
      const w = await watchCheck(v.url, clean(p1.full_name ?? input.name), role)
      if (w) return w.appears ? { checked: 'watched' as const, evidence: w.evidence } : null
    }
    return strongNamed(v) ? { checked: 'named' as const, evidence: null } : null
  }))
  const verified: CardVideo[] = pool.flatMap((v, i) => checks[i] ? [{ url: v.url, title: v.title, channel: v.channel, date: v.date, duration: v.duration, thumbnail: v.thumbnail, checked: checks[i]!.checked, evidence: checks[i]!.evidence }] : [])
    .sort((a, b) => WATCHABLE_FIRST(a.url) - WATCHABLE_FIRST(b.url) || (a.checked === 'watched' ? 0 : 1) - (b.checked === 'watched' ? 0 : 1)).slice(0, 3)
  const videos = verified
  if (!videos.length && pool.length) concerns.push('Videos were found but none could be confirmed to feature this person, so none are shown.')
  const photos: Candidate[] = pick(g1.image, p1.photo_indexes, 'I', 3).map(m => ({ url: m.imageUrl, page_url: m.pageUrl, title: m.title }))
  const logos: Candidate[] = pick(logoImgs.filter(m => !BAD_IMAGE_HOST.test(m.imageUrl)), p1.logo_indexes, 'L', 2).map(m => ({ url: m.imageUrl, page_url: m.pageUrl, title: m.title }))
  if (p1.org_website) {
    const brand = await fetchBranding(p1.org_website)
    if (brand) logos.unshift({ url: brand, page_url: `https://${p1.org_website.replace(/^https?:\/\//, '')}`, title: 'Logo from the organisation’s own website' })
  }
  if (p1.org_website) logos.push({ url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(p1.org_website.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}&sz=256`, page_url: null, title: `${p1.org_website} site icon (fallback)` })
  const sources = uniqBy([...pick(g1.web, (p1.bio_sources ?? []).filter(s => /^W/.test(s)), 'W', 8).map(h => ({ url: h.link, title: h.title })), ...pick(pages.map(p => p.hit), (p1.bio_sources ?? []).filter(s => /^P/.test(s)), 'P', 8).map(h => ({ url: h.link, title: h.title })), ...pick(producerPages, (p1.bio_sources ?? []).filter(s => /^Q/.test(s)), 'Q', 4).map(p => ({ url: p.url, title: 'Page supplied by the producer' }))], s => s.url)
  concerns.push(...(p1.concerns ?? []))

  if (!p1.identified) {
    return { identified: false, confidence: p1.confidence ?? 0, full_name: p1.full_name ?? null, title: p1.title ?? null, organization: p1.organization ?? null, org_website: p1.org_website ?? null, nationality: null, nationality_iso2: null, linkedin_url: linkedinUrl, linkedin_note: p1.linkedin_note ?? null, bio: null, bio_words: 0, bio_removed: [], videos, photo_candidates: photos, logo_candidates: logos, sources, verification: { pass2_identified: null, title: 'unknown', organization: 'unknown', nationality: 'unknown', linkedin: 'unknown', pass2: null }, status: 'not_found', concerns: ['Could not confidently identify this person from public sources — a producer should supply details.', ...concerns] }
  }

  // ── Pass 2: blind, different model, its own searches ───────────────────
  const q2 = { web: [`${who(input)}`, `${clean(input.name)} ${org} profile nationality born`, `${clean(input.name)} linkedin ${org}`], video: [], image: [] as string[] }
  const g2 = await gather(input, q2)
  const webList2 = g2.web.slice(0, 14).map((h, i) => `[W${i}] ${h.title} — ${h.link}\n    ${h.snippet}`).join('\n')
  const prompt2 = `Identify this person using ONLY the search results below. Return JSON only.
Person: ${clean(input.name)}${input.designation ? `, ${clean(input.designation)}` : ''}${org ? `, ${org}` : ''}.

SEARCH RESULTS
${webList2 || '(none)'}

{"identified": true|false (true only if the results clearly show one person matching the name and organisation),
 "full_name": string|null, "title": "current job title"|null, "organization": "current employer"|null,
 "nationality_iso2": "ISO alpha-2 of nationality, only if stated or unmistakable"|null,
 "linkedin_index": "W index of their personal linkedin.com/in/ profile"|null, "notes": string}`
  let pass2: Record<string, unknown> | null = null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.5', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt2 }] }), signal: AbortSignal.timeout(60_000) })
    if (res.ok) { const j = await res.json() as { choices?: { message?: { content?: string } }[] }; pass2 = parseJson<Record<string, unknown>>(j.choices?.[0]?.message?.content ?? '') }
    else concerns.push(`The independent check could not run (OpenAI ${res.status}).`)
  } catch (e) { concerns.push(`The independent check could not run (${e instanceof Error ? e.message : 'error'}).`) }
  const l2i = idx(String(pass2?.linkedin_index ?? ''), 'W'); const l2 = l2i !== null ? g2.web[l2i]?.link ?? null : null
  const iso1 = (countryCode(p1.nationality_iso2) ?? countryCode(p1.nationality) ?? '').toUpperCase() || null, iso2 = String(pass2?.nationality_iso2 ?? '').toUpperCase() || null
  const verification: ResearchResult['verification'] = {
    pass2_identified: pass2 ? pass2.identified === true : null,
    title: pass2 ? overlap(p1.title, pass2.title as string | null) : 'unknown',
    organization: pass2 ? overlap(p1.organization, pass2.organization as string | null) : 'unknown',
    nationality: !pass2 || !iso1 || !iso2 ? 'unknown' : iso1 === iso2 ? 'match' : 'differs',
    linkedin: !linkedinUrl || !l2 ? 'unknown' : slug(linkedinUrl) === slug(l2) ? 'match' : 'differs',
    pass2,
  }
  if (pass2 && pass2.identified !== true) concerns.push('The independent check could not confirm who this is.')
  for (const k of ['title', 'organization', 'nationality', 'linkedin'] as const) if (verification[k] === 'differs') concerns.push(`The independent check disagrees on the ${k === 'organization' ? 'organisation' : k}.`)

  // ── Pass 3: bio claim check ────────────────────────────────────────────
  let bio = clean(p1.bio) || null
  const removed: string[] = []
  if (bio) {
    const evidence = [webList, pageList, producerBlock].join('\n\n')
    const prompt3 = `Fact-check a short biography against source material. For EACH sentence of the bio, decide if the source material directly supports it. Return JSON only:
{"sentences":[{"text":"…","supported":true|false,"why":"short"}]}
Be strict: a sentence is supported only if the sources state it (paraphrase is fine). Inferences, extra detail and flattering wording not in the sources are NOT supported.

BIO
${bio}

SOURCES
${evidence}`
    try {
      const model3 = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
      const j3 = parseJson<{ sentences?: { text: string; supported: boolean }[] }>(await generateCopy(model3, prompt3, `proposal bio check ${clean(input.name)}`))
      if (j3?.sentences?.length) {
        const keep = j3.sentences.filter(s => s.supported).map(s => s.text.trim())
        removed.push(...j3.sentences.filter(s => !s.supported).map(s => s.text.trim()))
        bio = keep.join(' ').trim() || null
      } else concerns.push('The bio fact-check could not run — read the bio against its sources.')
    } catch { concerns.push('The bio fact-check could not run — read the bio against its sources.') }
  }
  if (removed.length) concerns.push(`${removed.length} bio sentence${removed.length === 1 ? ' was' : 's were'} removed because the sources didn't support ${removed.length === 1 ? 'it' : 'them'}.`)
  if (!videos.length) concerns.push('No videos found.')
  if (!photos.length) concerns.push('No photo found.')
  if (!countryCode(p1.nationality_iso2) && !countryCode(p1.nationality)) concerns.push('No nationality — the flag is missing.')
  else if (p1.nationality_basis === 'team') concerns.push('Flag taken from the country in the team’s sheet; no source confirms the nationality.')

  const nameSame = !surname || mentions(clean(p1.full_name), surname)
  if (!nameSame) concerns.push(`The name found (${clean(p1.full_name)}) is spelled differently from the sheet (${clean(input.name)}) — confirm it is the same person.`)
  const producerSupplied = extraText.length > 80
  if (sources.length + (producerSupplied ? 1 : 0) < 2) concerns.push('Only one source supports the facts — a producer should confirm.')
  const agree = nameSame && sources.length + (producerSupplied ? 1 : 0) >= 2 && verification.pass2_identified === true && verification.title !== 'differs' && verification.organization !== 'differs' && verification.nationality !== 'differs' && verification.linkedin !== 'differs'
  return {
    identified: true, confidence: p1.confidence ?? 0, full_name: p1.full_name ?? null, title: p1.title ?? null, organization: p1.organization ?? null, org_website: p1.org_website ?? normalizeUrl(input.website)?.replace(/^https?:\/\//, '') ?? null,
    nationality: p1.nationality ?? null, nationality_iso2: iso1 ? iso1.toLowerCase() : null, linkedin_url: linkedinUrl, linkedin_note: p1.linkedin_note ?? null,
    bio, bio_words: words(bio), bio_removed: removed, videos, photo_candidates: photos, logo_candidates: logos, sources, verification,
    status: agree && (p1.confidence ?? 0) >= 0.7 && !!bio ? 'verified' : 'needs_review', concerns,
  }
}

/** Cleans a raw Excel row into a ProposalInput: stray titles, trailing commas, "Designation:" prefixes, split designation/company cells. */
export function cleanRow(r: { name?: unknown; designation?: unknown; company?: unknown; country?: unknown; linkedin?: unknown; track?: unknown; website?: unknown; extra?: unknown }): ProposalInput {
  const s = (v: unknown) => clean(typeof v === 'string' ? v : v == null ? '' : String(v))
  const strip = (v: string) => v.replace(/^(designation|organisation|organization)\s*:\s*/i, '').replace(/,\s*$/, '').trim()
  const designation = [strip(s(r.designation))].filter(Boolean)[0] ?? null
  return { name: s(r.name).replace(/,\s*$/, ''), designation: designation && !/^[\d+\s()-]{6,}$/.test(designation) ? designation : null, company: strip(s(r.company)) || null, country: s(r.country) || null, linkedin: /linkedin\.com\/in\//i.test(s(r.linkedin)) ? s(r.linkedin) : null, track: s(r.track) || null, website: normalizeUrl(s(r.website)), extra: typeof r.extra === 'string' && r.extra.trim() ? r.extra.trim() : null }
}

/** Downloads a chosen logo and runs it through the platform's logo engine (background removed, 600×300 white canvas). Null when it can't be fetched or read. */
export async function cleanLogoFromUrl(url: string): Promise<Buffer | null> {
  try {
    const { processLogo } = await import('@/app/lib/media/logo-engine')
    let buf: Buffer, mime: string, name: string
    if (url.startsWith('data:')) {
      const m = url.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/); if (!m) return null
      mime = m[1]; buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])); name = `logo.${mime.includes('svg') ? 'svg' : 'png'}`
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventPilot logo fetch)' } })
      if (!res.ok) return null
      mime = (res.headers.get('content-type') ?? '').split(';')[0] || 'application/octet-stream'
      buf = Buffer.from(await res.arrayBuffer()); name = new URL(url).pathname.split('/').pop() || 'logo'
    }
    if (buf.length > 15 * 1024 * 1024) return null
    const out = (await processLogo(buf, name, mime)).buffer
    // A white-on-transparent header logo comes out as an empty white canvas — treat that as unusable so the next candidate is tried.
    const { default: sharp } = await import('sharp')
    const { data, info } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
    let ink = 0
    for (let i = 0; i < data.length; i++) if (data[i] < 235) ink++
    return ink / (info.width * info.height) >= 0.004 ? out : null
  } catch (e) { console.error('[proposals] logo clean failed:', e instanceof Error ? e.message : e); return null }
}
