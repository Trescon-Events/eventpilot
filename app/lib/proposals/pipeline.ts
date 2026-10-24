import sharp from 'sharp'
import { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import {
  BAD_IMAGE_HOST, WATCHABLE_FIRST, clean, gather, gemini, mentions, norm, normalizeUrl, opensFine, overlap, parseJson, rankVideos, slug, surnameOf, toks, uniqBy, watchCheck, minutes, TITLE_WORDS,
  type CardVideo, type Candidate, type ProposalInput, type ResearchResult,
} from './research'
import { fetchBranding, imageSearch, type ImageHit, type VideoHit, type WebHit } from './search'
import { canFetch, domainOf, fetchPageRich } from './pages'
import { readSource, type SourceReport } from './readers'
import { countryCode } from './countries'

/* Speaker Proposals — the research pipeline (v2). Fixed stages run by plain code, each stage using the tool that is best at it:
     1 Discover      Serper: many targeted searches (web, video, image) → candidate pages, ranked by how much each source deserves trust
     2 Read          Firecrawl (page text + HTML + images) and Gemini Flash "readers", one per page, in parallel → a SourceReport each (proof-checked in code)
     3 Consolidate   Gemini Pro merges the reports field by field (newest + most authoritative wins; conflicts are flagged, never averaged)
     4 Fill gaps     if a photo / bio / identity is still missing: up to two more targeted rounds, then stop
     5 Compose       photos ranked + validated (+ a same-person check by Gemini vision); bio written only from what sources said; videos watched by Gemini
     6 Verify        OpenAI re-checks the key facts blind (different model family); the bio is fact-checked sentence by sentence
     7 Finalise      status + concerns for the producer
   A producer's "Drop more info" re-runs only stages 3, 5, 6, 7 on the saved reports (plus any new links) — no new searching — unless the name/role changed. */

export type PipelineState = {
  identity: { name: string; designation: string | null; company: string | null }
  reports: SourceReport[]; web: { title: string; link: string; snippet: string }[]; images: ImageHit[]; videos: VideoHit[]; rounds: number; read_urls: string[]; pages_read: number
}
export type PipelineResult = ResearchResult & { pipeline: PipelineState }

/** What the pipeline is doing right now, reported as it goes so the page can show real progress. */
export type ProgressStage = 'search' | 'read' | 'merge' | 'fill' | 'write' | 'verify'
export type Progress = { stage: ProgressStage; label: string; detail: string | null; done: number | null; total: number | null; at: string }
export type OnProgress = (p: Progress) => void | Promise<void>

// ── source authority ──────────────────────────────────────────────────────
const AGGREGATORS = /zoominfo|rocketreach|contactout|signalhire|apollo\.io|lusha|clay\.com|dnb\.com|opencorporates|peoplepill|wikitia|everybodywiki|datanyze|leadiq|spokeo|prabook|alchetron|theorg\.com|biography\.com\/people|aeroleads|prospeo|swordfish|kaspr|seamless\.ai|clearbit|hunter\.io|snov\.io|adapt\.io|cognism|lead411|salesintel|leadgenius|bigspark|peekyou|mylife|radaris|nndb|famousbirthdays|wikidata/i
const MEDIA = /reuters|bloomberg|bbc\.|ft\.com|forbes|cnbc|apnews|gulfnews|thenationalnews|khaleejtimes|wam\.ae|zawya|arabnews|aljazeera|economist|wsj\.com|nytimes|theguardian|timesofindia|economictimes|hindustantimes/i
const PEOPLE_PATH = /\/(speakers?|people|team|leadership|management|about|bio|profiles?|staff|board|executives?|directors?)(\/|-|\b)/i
const ORG_STOP = new Set(['of', 'the', 'and', 'for', 'group', 'international', 'limited', 'ltd', 'inc', 'llc', 'company', 'corporation', 'authority', 'department', 'ministry', 'office', 'center', 'centre', 'national', 'general'])

export function orgTokensOf(org: string | null | undefined): { tokens: string[] } {
  const o = clean(org)
  const caps = (o.match(/\b[A-Z]{2,6}\b/g) ?? []).map(t => t.toLowerCase())
  const words = norm(o).split(' ').filter(w => w.length >= 4 && !ORG_STOP.has(w))
  const initials = o.split(/\s+/).filter(w => /^[A-Z]/.test(w) && !ORG_STOP.has(w.toLowerCase())).map(w => w[0].toLowerCase()).join('')
  return { tokens: [...new Set([...caps, ...words, ...(initials.length >= 3 ? [initials] : [])])] }
}

const GENERIC_ORG = new Set(['dubai', 'abu', 'dhabi', 'uae', 'emirates', 'emirate', 'sharjah', 'saudi', 'arabia', 'qatar', 'national', 'general', 'department', 'authority', 'ministry', 'government', 'gov', 'group', 'international', 'federal', 'central', 'bank', 'company', 'corporation', 'limited', 'ltd', 'llc', 'fzco', 'fze', 'inc', 'the', 'and', 'of', 'for', 'hq', 'headquarters', 'office', 'center', 'centre', 'council', 'institute', 'university', 'college'])
/** Do two organisation names plausibly name the same body? Generic words (city, "authority", "group"…) don't count; acronyms in brackets do. Pure. */
export function orgAgreement(sheet: string | null | undefined, found: string | null | undefined): 'match' | 'differs' | 'unknown' {
  const distinct = (o: string) => {
    const caps = (clean(o).match(/\b[A-Z]{2,6}\b/g) ?? []).map(c => c.toLowerCase())
    const words = norm(o).split(' ').filter(w => w.length > 2 && !GENERIC_ORG.has(w))
    const initials = norm(o).split(' ').filter(w => w && !['of', 'the', 'and', 'for'].includes(w)).map(w => w[0]).join('') // Virtual Assets Regulatory Authority → vara
    return new Set([...caps, ...words, ...(initials.length >= 3 ? [initials] : [])])
  }
  const a = distinct(clean(sheet)), b = distinct(clean(found))
  if (!a.size || !b.size) return 'unknown'
  return [...a].some(t => b.has(t) || [...b].some(u => u.length > 4 && t.length > 4 && (u.startsWith(t.slice(0, 5)) || t.startsWith(u.slice(0, 5))))) ? 'match' : 'differs'
}

/** How much a page deserves to be read first / trusted (0–8). Pure. */
export function authorityOf(link: string, ctx: { orgDomains: string[]; orgTokens: string[] }): number {
  let u: URL; try { u = new URL(link) } catch { return 0 }
  const host = u.hostname.replace(/^www\./, '').toLowerCase(), path = u.pathname.toLowerCase()
  let score = 1
  if (ctx.orgDomains.some(d => host === d || host.endsWith('.' + d))) score += 3
  else if (ctx.orgTokens.some(t => t.length >= 3 && host.split('.').some(lab => lab.includes(t)))) score += 2
  if (/\.(gov|int|edu|mil)(\.[a-z]{2})?$|\.ac\.[a-z]{2}$|\.gov\.[a-z]{2}$|(^|\.)europa\.eu$|(^|\.)un\.org$/.test(host)) score += 2
  if (/(^|\.)wikipedia\.org$/.test(host)) score += 2
  if (MEDIA.test(host)) score += 1
  if (PEOPLE_PATH.test(path)) score += 2
  if (AGGREGATORS.test(host + path)) return 0 // lead-generation / people-data sites: never evidence on their own
  return Math.max(1, Math.min(8, score))
}

const fileKey = (url: string) => (url.split('?')[0].split('/').pop() ?? url).toLowerCase().replace(/[-_]?\d{2,4}x\d{2,4}/, '')
const urlKey = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase()

// ── photos ────────────────────────────────────────────────────────────────
export type PhotoCand = { url: string; authority: number; via: string; why: string }

/** Every photo that could be this person's, best first: photos found ON trusted pages next to their name, then image-search hits that name them. Pure. */
export function candidatePhotos(reports: SourceReport[], images: ImageHit[], surname: string | null): PhotoCand[] {
  const out: PhotoCand[] = []
  for (const r of reports) {
    if (r.about === 'no' || r.authority < 1) continue // lead-gen aggregators never supply the photo
    for (const p of r.photos) out.push({ url: p.url, authority: r.authority + (r.about === 'yes' ? 2 : 0) + 4, via: r.domain, why: p.why })
  }
  for (const m of images) {
    if (BAD_IMAGE_HOST.test(m.imageUrl) || (m.width !== null && m.width < 250)) continue
    if (!mentions(`${m.title} ${m.pageUrl} ${m.imageUrl.replace(/[-_./%]/g, ' ')}`, surname)) continue
    out.push({ url: m.imageUrl, authority: 1, via: domainOf(m.pageUrl) || 'image search', why: m.title.slice(0, 60) })
  }
  const seen = new Set<string>()
  return out.filter(c => { const k = fileKey(c.url); if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => b.authority - a.authority)
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventPilot photo check)' } })
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 4_000 && buf.length < 12 * 1024 * 1024 ? buf : null
  } catch { return null }
}

/** Gemini vision answers one narrow question: which of these photos show the same person? (It does not identify anyone.) */
async function sameWho(bufs: Buffer[]): Promise<number[][] | null> {
  try {
    const small = await Promise.all(bufs.map(b => sharp(b).rotate().resize(512, 512, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()))
    const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: { responseMimeType: 'application/json' } })
    const parts = small.flatMap((b, i) => [{ text: `Photo ${i}:` }, { inlineData: { mimeType: 'image/jpeg', data: b.toString('base64') } }])
    const r = await model.generateContent([...parts, { text: `Which of these ${small.length} photos show the SAME person? Group them by person; a photo with no clear face goes in its own group. Do not try to name anyone. Return JSON only: {"groups":[[0,2],[1]]}` }] as never, { timeout: 45_000 })
    const j = parseJson<{ groups?: number[][] }>(r.response.text())
    const groups = (j?.groups ?? []).map(g => g.filter(i => Number.isInteger(i) && i >= 0 && i < small.length)).filter(g => g.length)
    return groups.length ? groups : null
  } catch (e) { console.error('[proposals] photo comparison failed:', e instanceof Error ? e.message : e); return null }
}

async function choosePhotos(cands: PhotoCand[], concerns: string[]): Promise<Candidate[]> {
  const loaded: { c: PhotoCand; buf: Buffer }[] = []
  for (const c of cands.slice(0, 6)) {
    if (loaded.length >= 4) break
    const buf = await fetchImage(c.url); if (!buf) continue
    const m = await sharp(buf).metadata().catch(() => null)
    if (!m?.width || !m.height || m.width < 200 || m.height < 200 || m.width / m.height > 1.8 || m.height / m.width > 2.4) continue
    loaded.push({ c, buf })
  }
  if (!loaded.length) return []
  let keep = loaded
  if (loaded.length >= 2) {
    const groups = await sameWho(loaded.map(l => l.buf))
    if (groups && groups.length > 1) {
      // the biggest group wins; a tie goes to the group holding the best-ranked photo
      const best = [...groups].sort((a, b) => b.length - a.length || (a.includes(0) ? -1 : 1))[0]
      keep = best.map(i => loaded[i]).sort((a, b) => b.c.authority - a.c.authority)
      concerns.push(`The photos found do not all show the same person; only ${keep.length === 1 ? 'the best-sourced one is' : 'the group that agrees is'} offered (${loaded.length - keep.length} dropped). Check the photo.`)
    }
  }
  return keep.slice(0, 3).map(k => ({ url: k.c.url, page_url: null, title: `${k.c.via}${k.c.why ? ` — ${k.c.why}` : ''}` }))
}

// ── consolidation ─────────────────────────────────────────────────────────
type Consol = {
  identified: boolean; confidence: number; full_name: string | null; title: string | null; organization: string | null; org_website: string | null
  nationality: string | null; nationality_iso2: string | null; nationality_basis: 'sources' | 'team' | null; linkedin_index: string | null; linkedin_note: string | null; conflicts: string[]; concerns: string[]
}
type RawConsol = Omit<Partial<Consol>, 'conflicts' | 'linkedin_index'> & { conflicts?: (string | { text?: string; material?: boolean })[]; linkedin_index?: string | number | null }

export async function consolidate(input: ProposalInput, reports: SourceReport[], linkedin: PipelineState['web'], producerBlock: string): Promise<Consol | null> {
  const useful = reports.filter(r => r.about !== 'no')
  const list = useful.map((r, i) => `[R${i}] ${r.domain} (trust ${r.authority}/8${r.page_date ? `, dated ${r.page_date}` : ', undated'}) says it is about this person: ${r.about}${r.match_quote ? ` — "${r.match_quote.replace(/\s+/g, ' ').slice(0, 140)}"` : ''}
    title: ${r.person_title ?? '-'} | organisation: ${r.organization ?? '-'} | nationality: ${r.nationality ?? '-'}${r.notes ? ` | note: ${r.notes}` : ''}
    facts: ${r.facts.slice(0, 4).map(f => f.claim).join('; ') || '-'}`).join('\n')
  const li = linkedin.slice(0, 6).map((h, i) => `[L${i}] ${h.link} — ${h.title} — ${h.snippet}`).join('\n')
  const prompt = `You are the research lead. Several readers each read one web page and reported what it shows. Merge their reports into ONE profile of the proposed speaker. Use ONLY the reports below — never your own memory. Return JSON only.

THE PERSON (from our sheet; may be misspelled or incomplete)
Name: ${clean(input.name)} | Designation: ${clean(input.designation) || '-'} | Organisation: ${clean(input.company) || '-'} | Country given by our team (their nationality): ${clean(input.country) || '-'}

${producerBlock}READER REPORTS
${list || '(none)'}

LINKEDIN SEARCH RESULTS
${li || '(none)'}

Rules:
- identified: true only if the reports clearly show ONE person matching the name AND organisation/role. A producer's own information describing this person counts, and so does a LinkedIn search result whose title/snippet clearly gives this name together with this organisation or role.
- Today is ${new Date().toISOString().slice(0, 10)}; pages dated up to today are valid, do not call them future-dated.
- title / organization: the CURRENT role. If reports disagree, prefer the most recent dated page, then the most trusted (trust score), and say so in "conflicts". A page marked "former", "past" or older than a newer page does not win.
- full_name: the standard spelling the trusted sources use (keep a formal rank like Major General if they do; drop Mr/Mrs).
- org_website: the organisation's own web domain if any report is from it or names it; else null.
- nationality: what sources state. If they are silent use the team's country (basis "team"). If sources point to a DIFFERENT nationality than the team's, use the sources' and note it in "conflicts". Never use where they merely work or live. Give the ISO 3166-1 alpha-2 code.
- linkedin_index: the L index of THEIR personal linkedin.com/in/ profile (its title/snippet must match the name and employer), else null. Explain doubts in linkedin_note.
- conflicts: each disagreement between sources as {"text":"","material":true|false}. material = true ONLY if it could change what we tell the client about WHO this is, their CURRENT employer or the level of their role, or their nationality. NOT material: a different person with the same name that you already set aside, the same organisation under different names or a parent/child body, a title worded differently (Founder vs Co-Founder), name spelling variants, middle names, past roles, odd page dates.
- confidence 0–1. concerns: what a human should double-check.
{"identified":true,"confidence":0.0,"full_name":null,"title":null,"organization":null,"org_website":null,"nationality":null,"nationality_iso2":null,"nationality_basis":null,"linkedin_index":null,"linkedin_note":null,"conflicts":[{"text":"","material":false}],"concerns":[]}`
  try {
    const model = gemini().getGenerativeModel({ model: GEMINI_PRO_MODEL, generationConfig: COPY_GENERATION_CONFIG })
    const raw = await generateCopy(model, prompt, `proposal consolidate ${clean(input.name)}`)
    const j = parseJson<RawConsol>(raw)
    if (!j || typeof j.identified !== 'boolean') { console.error('[proposals] consolidate returned an unusable answer:', raw.slice(0, 1800)); return null }
    return {
      identified: j.identified === true, confidence: typeof j.confidence === 'number' ? j.confidence : 0, full_name: j.full_name ?? null, title: j.title ?? null, organization: j.organization ?? null, org_website: j.org_website ?? null,
      nationality: j.nationality ?? null, nationality_iso2: j.nationality_iso2 ?? null, nationality_basis: j.nationality_basis === 'sources' || j.nationality_basis === 'team' ? j.nationality_basis : null,
      linkedin_index: j.linkedin_index === null || j.linkedin_index === undefined ? null : String(j.linkedin_index), linkedin_note: j.linkedin_note ?? null,
      // only MATERIAL disagreements are "conflicts" (they block verification); the rest are notes for the producer
      conflicts: (j.conflicts ?? []).filter(c => typeof c === 'object' && c?.material === true && c.text).map(c => (c as { text: string }).text),
      concerns: [...(j.concerns ?? []), ...(j.conflicts ?? []).filter(c => typeof c === 'string' || (c && c.material !== true && c.text)).map(c => `Note: ${typeof c === 'string' ? c : c.text}`)],
    }
  } catch (e) { console.error('[proposals] consolidate failed:', e instanceof Error ? e.message : e); return null }
}

// ── gaps ──────────────────────────────────────────────────────────────────
export type Gap = 'identity' | 'photo' | 'bio' | 'site'
const bioWords = (reports: SourceReport[]) => reports.filter(r => r.about === 'yes' && r.authority >= 1).reduce((n, r) => n + (r.bio_excerpt ?? '').split(/\s+/).filter(Boolean).length, 0)

export function findGaps(reports: SourceReport[], photos: PhotoCand[], consol: Pick<Consol, 'org_website'> | null, producerSupplied: boolean): Gap[] {
  const gaps: Gap[] = []
  if (!reports.some(r => r.about === 'yes') && !producerSupplied) gaps.push('identity')
  if (!photos.length) gaps.push('photo')
  if (bioWords(reports) < 60 && !producerSupplied) gaps.push('bio')
  if (!consol?.org_website) gaps.push('site')
  return gaps
}

export function gapQueries(input: ProposalInput, consol: Pick<Consol, 'full_name' | 'title' | 'organization' | 'org_website'> | null, gaps: Gap[]): { web: string[]; image: string[] } {
  const name = clean(consol?.full_name || input.name), org = clean(consol?.organization || input.company), title = clean(consol?.title || input.designation)
  const web: string[] = [], image: string[] = []
  const site = consol?.org_website ? domainOf(/^https?:/.test(consol.org_website) ? consol.org_website : `https://${consol.org_website}`) : ''
  if (gaps.includes('identity')) web.push(`"${name}" "${org}"`, `"${name}" ${title} appointed OR named OR joins`)
  if (gaps.includes('bio')) web.push(`"${name}" ${org} biography`, `"${name}" ${org} speaker profile`, `"${name}" ${org} leadership team about`)
  if (gaps.includes('photo')) { web.push(`"${name}" ${org} headshot OR portrait`); image.push(`"${name}" ${org} portrait`, `"${name}" headshot`) }
  if (site && (gaps.includes('bio') || gaps.includes('photo') || gaps.includes('identity'))) web.push(`site:${site} "${name}"`)
  return { web: uniqBy(web.map(q => ({ q })), x => x.q).map(x => x.q), image }
}

// ── reading pages ─────────────────────────────────────────────────────────
async function readPages(input: ProposalInput, hits: PipelineState['web'], ctx: { orgDomains: string[]; orgTokens: string[] }, already: Set<string>, max: number, forced: string[] = [], onTick?: (done: number, total: number) => void): Promise<SourceReport[]> {
  const perDomain = new Map<string, number>()
  const ranked = hits.filter(h => canFetch(h.link) && !already.has(urlKey(h.link))).map((h, i) => ({ h, a: authorityOf(h.link, ctx), i })).sort((x, y) => y.a - x.a || x.i - y.i)
  const picked: { url: string; a: number }[] = forced.filter(u => canFetch(u) && !already.has(urlKey(u))).map(u => ({ url: u, a: 6 }))
  for (const r of ranked) {
    if (picked.length >= max + forced.length) break
    const d = domainOf(r.h.link); if ((perDomain.get(d) ?? 0) >= 2) continue
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1); picked.push({ url: r.h.link, a: r.a })
  }
  for (const p of picked) already.add(urlKey(p.url))
  let finished = 0
  onTick?.(0, picked.length)
  const reports = await Promise.all(picked.map(async p => { const page = await fetchPageRich(p.url); const r = page ? await readSource(input, page, p.a) : null; onTick?.(++finished, picked.length); return r }))
  return reports.filter((r): r is SourceReport => !!r)
}

// ── the pipeline ──────────────────────────────────────────────────────────
const sameIdentity = (a: PipelineState['identity'], i: ProposalInput) => norm(a.name) === norm(i.name) && norm(a.designation) === norm(i.designation) && norm(a.company) === norm(i.company)

export async function researchCandidate(input: ProposalInput, prior?: PipelineState | null, onProgress?: OnProgress): Promise<PipelineResult> {
  const say = (stage: ProgressStage, label: string, detail: string | null = null, done: number | null = null, total: number | null = null) => { try { void Promise.resolve(onProgress?.({ stage, label, detail, done, total, at: new Date().toISOString() })).catch(() => {}) } catch { /* progress is best-effort */ } }
  const concerns: string[] = []
  const org = clean(input.company), surname = surnameOf(input.name)
  const reuse = !!prior && sameIdentity(prior.identity, input)
  const ctx0 = { orgDomains: [] as string[], orgTokens: orgTokensOf(org).tokens }
  if (normalizeUrl(input.website)) ctx0.orgDomains.push(domainOf(normalizeUrl(input.website)!))

  // what the producer told us: free text + links they dropped (read as trusted pages)
  const extraText = (input.extra ?? '').trim().slice(0, 12000)
  const producerUrls = uniqBy([...(extraText.match(/https?:\/\/[^\s)>\]"']+/g) ?? []), ...(normalizeUrl(input.website) ? [normalizeUrl(input.website)!] : [])].map(u => ({ u })), x => urlKey(x.u)).map(x => x.u).filter(u => !/linkedin\.com/i.test(u)).slice(0, 4)
  const producerBlock = extraText ? `PRODUCER-PROVIDED INFORMATION (our producer vouches for who this person is; treat as a source for identity and facts; may include text pasted from their LinkedIn profile):\n${extraText}\n\n` : ''
  const producerSupplied = extraText.length > 80

  let web: PipelineState['web'] = reuse ? prior!.web : [], images: ImageHit[] = reuse ? prior!.images : [], videos: VideoHit[] = reuse ? prior!.videos : []
  const reports: SourceReport[] = reuse ? [...prior!.reports] : []
  const already = new Set<string>(reuse ? prior!.read_urls : [])
  let rounds = reuse ? prior!.rounds : 0, pagesRead = reuse ? prior!.pages_read : 0

  // 1 + 2 — discover and read (skipped on a cheap re-verification, except for newly dropped links)
  if (!reuse) {
    say('search', 'Searching the web', 'Looking for pages, videos and photos')
    const g = await gather(input, {
      web: [`"${clean(input.name)}" ${org}`, `"${clean(input.name)}" ${org} linkedin`, `"${clean(input.name)}" ${clean(input.designation)} biography`, `"${clean(input.name)}" speaker ${org}`, `"${clean(input.name)}" ${org} wikipedia`, ...(ctx0.orgDomains[0] ? [`site:${ctx0.orgDomains[0]} "${clean(input.name)}"`] : [])],
      video: [`"${clean(input.name)}" ${org}`, `"${clean(input.name)}" speech OR keynote OR interview OR panel`, `${clean(input.name)} ${org} youtube`],
      image: [`"${clean(input.name)}" ${org}`, `"${clean(input.name)}" headshot OR portrait ${org}`],
    })
    web = g.web.map(h => ({ title: h.title, link: h.link, snippet: h.snippet })); images = g.image; videos = g.video
  }
  const newProducerUrls = producerUrls.filter(u => !already.has(urlKey(u)))
  const firstRound = await readPages(input, web, ctx0, already, reuse ? 0 : 10, newProducerUrls, (d, t) => { if (t > 0) say('read', 'Reading pages', `Page ${Math.min(d + 1, t)} of ${t}`, d, t) })
  reports.push(...firstRound); pagesRead += firstRound.length + (reuse ? 0 : 0)
  if (!reuse) rounds = 1

  // 3 + 4 — consolidate, then fill gaps (max two more rounds)
  const linkedinHits = () => web.filter(h => /linkedin\.com\/in\//i.test(h.link))
  say('merge', 'Comparing what the pages say', `${reports.filter(r => r.about === 'yes').length} confirm it is them`)
  let consol = await consolidate(input, reports, linkedinHits(), producerBlock)
  for (let round = 0; !reuse && round < 2; round++) {
    const gaps = findGaps(reports, candidatePhotos(reports, images, surname), consol, producerSupplied)
    if (!gaps.length || (gaps.length === 1 && gaps[0] === 'site')) break
    const q = gapQueries(input, consol, gaps)
    if (!q.web.length && !q.image.length) break
    say('fill', `Looking for what is missing (${gaps.filter(g => g !== 'site').join(', ')})`, `Extra search ${round + 1} of 2`)
    const g = await gather(input, { web: q.web, video: [], image: q.image })
    const known = new Set(web.map(h => urlKey(h.link)))
    const fresh = g.web.filter(h => !known.has(urlKey(h.link)))
    web = [...web, ...fresh.map(h => ({ title: h.title, link: h.link, snippet: h.snippet }))]
    images = uniqBy([...images, ...g.image], m => m.imageUrl)
    const ctx = { orgDomains: [...ctx0.orgDomains, ...(consol?.org_website ? [domainOf(/^https?:/.test(consol.org_website) ? consol.org_website : `https://${consol.org_website}`)] : [])], orgTokens: ctx0.orgTokens }
    const more = await readPages(input, fresh, ctx, already, 5, [], (d, t) => { if (t > 0) say('fill', `Looking for what is missing (${gaps.filter(g => g !== 'site').join(', ')})`, `Extra search ${round + 1} of 2 — page ${Math.min(d + 1, t)} of ${t}`, d, t) })
    rounds++
    if (!more.length && !g.image.length) break
    reports.push(...more); pagesRead += more.length
    say('merge', 'Comparing what the pages say', 'Merging the new findings')
    consol = await consolidate(input, reports, linkedinHits(), producerBlock)
  }
  const yes = reports.filter(r => r.about === 'yes')
  const emptyResult = (c: Consol | null, why: string): PipelineResult => ({
    identified: false, confidence: c?.confidence ?? 0, full_name: c?.full_name ?? null, title: c?.title ?? null, organization: c?.organization ?? null, org_website: c?.org_website ?? null, nationality: null, nationality_iso2: null,
    linkedin_url: null, linkedin_note: c?.linkedin_note ?? null, bio: null, bio_words: 0, bio_removed: [], videos: [], photo_candidates: [], logo_candidates: [], sources: [],
    verification: { pass2_identified: null, title: 'unknown', organization: 'unknown', nationality: 'unknown', linkedin: 'unknown', pass2: null }, status: 'not_found',
    concerns: [why, ...(c?.concerns ?? [])], pipeline: { identity: { name: input.name, designation: input.designation, company: input.company }, reports: reports.filter(r => r.about !== 'no'), web, images, videos, rounds, read_urls: [...already], pages_read: pagesRead },
  })
  if (!consol) throw new Error('The research model returned something unreadable.')
  const linkedinPick = consol.linkedin_index !== null ? linkedinHits()[Number(String(consol.linkedin_index).replace(/\D/g, ''))] : undefined
  if (!consol.identified || (!yes.length && !producerSupplied && !(linkedinPick && /linkedin\.com\/in\//i.test(linkedinPick.link)))) {
    const r = emptyResult(consol, 'Could not confidently identify this person from public sources — a producer should supply details.')
    r.logo_candidates = await logoCandidates(consol, org, ctx0)
    return r
  }

  // 5 — compose: photos, bio, videos, logos
  say('write', 'Building the card', 'Choosing and checking the photo')
  const photoCands = candidatePhotos(reports, images, surname)
  const photos = await choosePhotos(photoCands, concerns)
  const linkedinHit = linkedinPick
  const linkedinUrl = linkedinHit && /linkedin\.com\/in\//i.test(linkedinHit.link) ? linkedinHit.link.split('?')[0] : null

  // search-result snippets that name the person are real (if thin) evidence too — the single-pass engine used them and they rescue people with sparse pages
  const snippetEvidence = web.filter(h => mentions(`${h.title} ${h.snippet}`, surname) && !AGGREGATORS.test(h.link)).slice(0, 12).map(h => `[${domainOf(h.link)}] ${h.title} — ${h.snippet}`)
  const evidence = [reports.filter(r => r.about !== 'no' && r.authority >= 1).map(r => `[${r.domain}] ${r.bio_excerpt ?? ''}\n${r.facts.map(f => `- ${f.claim}: "${f.quote}"`).join('\n')}`).join('\n\n'), snippetEvidence.length ? `SEARCH SNIPPETS\n${snippetEvidence.join('\n')}` : '', producerBlock].join('\n\n')
  say('write', 'Building the card', 'Writing and fact-checking the bio')
  let bio: string | null = null, bioWordsOut = 0
  const removed: string[] = []
  const factCount = reports.filter(r => r.about === 'yes' && r.authority >= 1).reduce((n, r) => n + r.facts.length, 0)
  if (bioWords(reports) >= 25 || factCount >= 3 || snippetEvidence.length >= 3 || producerSupplied) {
    const composePrompt = `Write a short biography of a proposed conference speaker for a client's review deck, using ONLY the material below. About 120 words (100–130), third person, neutral and factual, plain words, no hype (no renowned/leading/visionary). Open with who they are and their CURRENT role${consol.title ? ` (${consol.title}${consol.organization ? `, ${consol.organization}` : ''})` : ''}. Use present tense for the current role only. If the material supports fewer than 100 words, write fewer — never pad or guess. Return JSON {"bio":""}.

PERSON: ${consol.full_name ?? clean(input.name)}
MATERIAL
${evidence.slice(0, 14000)}`
    try {
      const m = gemini().getGenerativeModel({ model: GEMINI_PRO_MODEL, generationConfig: COPY_GENERATION_CONFIG })
      bio = clean(parseJson<{ bio?: string }>(await generateCopy(m, composePrompt, `proposal bio ${clean(input.name)}`))?.bio) || null
    } catch (e) { concerns.push('The bio could not be written right now.'); console.error('[proposals] compose failed:', e instanceof Error ? e.message : e) }
    if (bio) {
      const checkPrompt = `Fact-check a short biography against source material. For EACH sentence of the bio, decide if the source material directly supports it. Return JSON only:
{"sentences":[{"text":"…","supported":true|false,"why":"short"}]}
Be strict: supported only if the sources state it (paraphrase is fine). Inferences, extra detail and flattering wording not in the sources are NOT supported.

BIO
${bio}

SOURCES
${evidence.slice(0, 14000)}`
      try {
        const m3 = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
        const j3 = parseJson<{ sentences?: { text: string; supported: boolean }[] }>(await generateCopy(m3, checkPrompt, `proposal bio check ${clean(input.name)}`))
        if (j3?.sentences?.length) {
          removed.push(...j3.sentences.filter(s => !s.supported).map(s => s.text.trim()))
          bio = j3.sentences.filter(s => s.supported).map(s => s.text.trim()).join(' ').trim() || null
        } else concerns.push('The bio fact-check could not run — read the bio against its sources.')
      } catch { concerns.push('The bio fact-check could not run — read the bio against its sources.') }
    }
    bioWordsOut = (bio ?? '').split(/\s+/).filter(Boolean).length
  }
  if (removed.length) concerns.push(`${removed.length} bio sentence${removed.length === 1 ? ' was' : 's were'} removed because the sources didn't support ${removed.length === 1 ? 'it' : 'them'}.`)

  say('write', 'Building the card', 'Checking videos and finding the logo')
  // videos: YouTube / Vimeo first; a clip is shown only if Gemini watched it and the person is introduced with a matching role, or its text carries name + organisation/role
  const ranked = rankVideos(videos)
  const firstName = norm(clean(consol.full_name ?? input.name).split(' ').filter(w => !TITLE_WORDS.test(w))[0] ?? '')
  const ctxTokens = [...toks(`${consol.organization ?? ''} ${org}`), ...toks(consol.title ?? input.designation)].filter(t => t.length > 3)
  const text = (v: VideoHit) => `${v.title} ${v.snippet ?? ''} ${v.channel ?? ''}`
  const strongNamed = (v: VideoHit) => { const t = norm(text(v)).split(' '); return mentions(text(v), surname) && mentions(text(v), firstName) && ctxTokens.some(c => t.includes(c)) }
  const pool = ranked.filter(v => WATCHABLE_FIRST(v.url) <= 1 || strongNamed(v) || mentions(text(v), surname)).slice(0, 7)
  const role = `${consol.title ?? input.designation ?? ''}, ${consol.organization ?? org}`
  const checks = await Promise.all(pool.map(async (v, i) => {
    if (!(await opensFine(v.url))) return null
    const isYt = /youtube\.com|youtu\.be/i.test(v.url), len = minutes(v.duration)
    if (isYt && i < 5 && (len === null || len <= 60)) { const w = await watchCheck(v.url, clean(consol.full_name ?? input.name), role); if (w) return w.appears ? { checked: 'watched' as const, evidence: w.evidence } : null }
    return strongNamed(v) ? { checked: 'named' as const, evidence: null } : null
  }))
  const cardVideos: CardVideo[] = pool.flatMap((v, i) => checks[i] ? [{ url: v.url, title: v.title, channel: v.channel, date: v.date, duration: v.duration, thumbnail: v.thumbnail, checked: checks[i]!.checked, evidence: checks[i]!.evidence }] : [])
    .sort((a, b) => WATCHABLE_FIRST(a.url) - WATCHABLE_FIRST(b.url) || (a.checked === 'watched' ? 0 : 1) - (b.checked === 'watched' ? 0 : 1)).slice(0, 3)
  if (!cardVideos.length && pool.length) concerns.push('Videos were found but none could be confirmed to feature this person, so none are shown.')

  const logos = await logoCandidates(consol, org, ctx0)

  // 6 — independent verification (a different model family, blind: it never sees the answer above)
  const iso1 = (countryCode(consol.nationality_iso2) ?? countryCode(consol.nationality) ?? countryCode(input.country) ?? '').toUpperCase() || null
  say('verify', 'Independent check', 'A second AI re-checks the key facts')
  const blind = await blindVerify(input, org)
  const verification: ResearchResult['verification'] = {
    pass2_identified: blind.pass2 ? blind.pass2.identified === true : null,
    title: blind.pass2 ? overlap(consol.title, blind.pass2.title as string | null) : 'unknown',
    organization: blind.pass2 ? overlap(consol.organization, blind.pass2.organization as string | null) : 'unknown',
    nationality: !blind.pass2 || !iso1 || !blind.iso2 ? 'unknown' : iso1 === blind.iso2 ? 'match' : 'differs',
    linkedin: !linkedinUrl || !blind.linkedin ? 'unknown' : slug(linkedinUrl) === slug(blind.linkedin) ? 'match' : 'differs',
    pass2: blind.pass2,
  }
  if (blind.note) concerns.push(blind.note)
  if (blind.pass2 && blind.pass2.identified !== true) concerns.push('The independent check could not confirm who this is.')
  for (const k of ['title', 'organization', 'nationality', 'linkedin'] as const) if (verification[k] === 'differs') concerns.push(`The independent check disagrees on the ${k === 'organization' ? 'organisation' : k}.`)

  // 7 — finalise
  concerns.push(...consol.conflicts.map(c => `Sources disagree: ${c}`), ...consol.concerns)
  if (!photos.length) concerns.push('No photo found after reading the sources — add one.')
  if (!iso1) concerns.push('No nationality — the flag is missing.')
  else if (consol.nationality_basis !== 'sources') concerns.push('Flag taken from the country in the team’s sheet; no source confirms the nationality.')
  // an independent source = a different site that isn't a lead-gen aggregator; a matching LinkedIn result counts as one
  const independent = new Set(yes.filter(r => r.authority >= 1).map(r => r.domain)).size + (producerSupplied ? 1 : 0) + (linkedinUrl ? 1 : 0)
  if (independent < 2) concerns.push('Only one independent source supports the facts — a producer should confirm.')
  const nameSame = !surname || mentions(clean(consol.full_name), surname)
  // the organisation the sources give must plausibly be the one in the sheet; otherwise it may be the wrong person (or the sheet is wrong)
  const orgOk = orgAgreement(input.company, consol.organization) !== 'differs'
  if (!orgOk) concerns.push(`The organisation found (${clean(consol.organization)}) is not the one in the sheet (${clean(input.company)}) — confirm this is the right person, or correct the sheet.`)
  if (!nameSame) concerns.push(`The name found (${clean(consol.full_name)}) is spelled differently from the sheet (${clean(input.name)}) — confirm it is the same person.`)
  if (!yes.length) concerns.push('Nothing was read from an independent page; this rests on the producer’s information only.')
  // sources that disagree on the facts always go to a human
  const agree = nameSame && orgOk && independent >= 2 && consol.conflicts.length === 0 && verification.pass2_identified === true && verification.title !== 'differs' && verification.organization !== 'differs' && verification.nationality !== 'differs' && verification.linkedin !== 'differs'
  const gave = (r: SourceReport) => [r.person_title || r.organization ? 'title' : '', r.bio_excerpt ? 'bio' : '', r.photos.length ? 'photo' : '', r.nationality ? 'nationality' : ''].filter(Boolean)
  const sources = reports.filter(r => r.about !== 'no').sort((a, b) => b.authority - a.authority).map(r => ({ url: r.url, title: r.title || r.domain, gave: gave(r) }))

  return {
    identified: true, confidence: consol.confidence, full_name: consol.full_name, title: consol.title, organization: consol.organization, org_website: consol.org_website,
    nationality: consol.nationality, nationality_iso2: iso1 ? iso1.toLowerCase() : null, linkedin_url: linkedinUrl, linkedin_note: consol.linkedin_note,
    bio, bio_words: bioWordsOut, bio_removed: removed, videos: cardVideos, photo_candidates: photos, logo_candidates: logos, sources, verification,
    status: agree && consol.confidence >= 0.7 && bioWordsOut >= 40 ? 'verified' : 'needs_review', concerns: [...new Set(concerns)],
    pipeline: { identity: { name: input.name, designation: input.designation, company: input.company }, reports: reports.filter(r => r.about !== 'no'), web, images, videos, rounds, read_urls: [...already], pages_read: pagesRead },
  }
}

async function logoCandidates(consol: Pick<Consol, 'org_website'> | null, org: string, ctx: { orgDomains: string[] }): Promise<Candidate[]> {
  const logoImgs = org ? await imageSearch(`${org} official logo`, 6).catch(() => [] as ImageHit[]) : []
  const logos: Candidate[] = logoImgs.filter(m => !BAD_IMAGE_HOST.test(m.imageUrl)).slice(0, 2).map(m => ({ url: m.imageUrl, page_url: m.pageUrl, title: m.title }))
  const site = consol?.org_website ?? ctx.orgDomains[0] ?? null
  if (site) {
    const brand = await fetchBranding(site)
    if (brand) logos.unshift({ url: brand, page_url: `https://${site.replace(/^https?:\/\//, '')}`, title: 'Logo from the organisation’s own website' })
    logos.push({ url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}&sz=256`, page_url: null, title: `${site} site icon (fallback)` })
  }
  return logos
}

async function blindVerify(input: ProposalInput, org: string): Promise<{ pass2: Record<string, unknown> | null; iso2: string | null; linkedin: string | null; note: string | null }> {
  const g2 = await gather(input, { web: [`${clean(input.name)}${org ? ` ${org}` : ''}`, `${clean(input.name)} ${org} profile nationality born`, `${clean(input.name)} linkedin ${org}`], video: [], image: [] })
  const list = g2.web.slice(0, 14).map((h, i) => `[W${i}] ${h.title} — ${h.link}\n    ${h.snippet}`).join('\n')
  const prompt = `Identify this person using ONLY the search results below. Return JSON only.
Person: ${clean(input.name)}${input.designation ? `, ${clean(input.designation)}` : ''}${org ? `, ${org}` : ''}.

SEARCH RESULTS
${list || '(none)'}

{"identified": true|false (true only if the results clearly show one person matching the name and organisation),
 "full_name": string|null, "title": "current job title"|null, "organization": "current employer"|null,
 "nationality_iso2": "ISO alpha-2 of nationality, only if stated or unmistakable"|null,
 "linkedin_index": "W index of their personal linkedin.com/in/ profile"|null, "notes": string}`
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.5', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(60_000) })
    if (!res.ok) return { pass2: null, iso2: null, linkedin: null, note: `The independent check could not run (OpenAI ${res.status}).` }
    const j = await res.json() as { choices?: { message?: { content?: string } }[] }
    const pass2 = parseJson<Record<string, unknown>>(j.choices?.[0]?.message?.content ?? '')
    const li = Number(String(pass2?.linkedin_index ?? '').replace(/\D/g, ''))
    return { pass2, iso2: String(pass2?.nationality_iso2 ?? '').toUpperCase() || null, linkedin: String(pass2?.linkedin_index ?? '') && Number.isFinite(li) ? g2.web[li]?.link ?? null : null, note: null }
  } catch (e) { return { pass2: null, iso2: null, linkedin: null, note: `The independent check could not run (${e instanceof Error ? e.message : 'error'}).` } }
}

