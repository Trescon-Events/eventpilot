import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireMarketIntelAccess } from '@/app/lib/access/market-intel-access'

export const maxDuration = 300

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const COMMERCIAL_SIGNALS = [
  'sponsor', 'exhibitor', 'partner', 'supporter', 'backer', 'pavilion',
  'powered-by', 'association', 'affiliate', 'vendor', 'booth',
  'platinum', 'gold', 'silver', 'bronze', 'strategic', 'media-partner',
  'knowledge-partner', 'community-partner', 'ecosystem',
]

const SKIP_SIGNALS = [
  'blog', 'news', 'press', 'careers', 'jobs', 'contact', 'privacy',
  'terms', 'cookie', 'sitemap', 'login', 'register', 'signup', 'faq',
]

const FORCED_PATHS = [
  '/sponsors', '/sponsor', '/partners', '/partner', '/exhibitors', '/exhibitor',
  '/our-partners', '/our-sponsors', '/sponsorship', '/about/sponsors',
  '/about/partners', '/supporters', '/ecosystem', '/media-partners',
  '/knowledge-partners', '/presenting-partners',
]

const SPEAKER_PATHS = [
  '/speakers', '/speaker', '/keynote', '/keynotes', '/keynote-speakers',
  '/agenda', '/sessions', '/programme', '/schedule', '/panelists',
  '/conference-speakers', '/featured-speakers', '/moderators',
]

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(9000),
      redirect: 'follow',
    })
    if (!res.ok) return ''
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return ''
    return await res.text()
  } catch {
    return ''
  }
}

async function fetchViaJina(url: string): Promise<{ text: string; rateLimited: boolean }> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown', 'X-Timeout': '15' },
      signal: AbortSignal.timeout(18000),
    })
    if (res.status === 429) return { text: '', rateLimited: true }
    if (!res.ok) return { text: '', rateLimited: false }
    return { text: await res.text(), rateLimited: false }
  } catch {
    return { text: '', rateLimited: false }
  }
}

async function fetchViaFirecrawl(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return ''
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return ''
    const json = await res.json()
    return json?.data?.markdown ?? ''
  } catch {
    return ''
  }
}

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const base = new URL(baseUrl)
  const candidates = [
    `${base.origin}/sitemap.xml`,
    `${base.origin}/sitemap_index.xml`,
    `${base.origin}/sitemap-0.xml`,
  ]
  const urls: string[] = []
  for (const sitemapUrl of candidates) {
    try {
      const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const xml = await res.text()
      const matches = xml.match(/<loc>([^<]+)<\/loc>/g) ?? []
      for (const m of matches) {
        const u = m.replace(/<\/?loc>/g, '').trim()
        if (u.startsWith(base.origin)) urls.push(u)
      }
      if (urls.length > 0) break
    } catch { /* skip */ }
  }
  return urls.slice(0, 200)
}

function extractImageAltText(html: string): string[] {
  const SECTION_SIGNALS = /sponsor|partner|exhibitor|supporter|platinum|gold|silver|bronze|diamond|media.partner|knowledge.partner|ecosystem|powered.by|in.association|affiliate|backer/i
  const JUNK = /^(logo|image|img|photo|icon|banner|slide|arrow|close|menu|search|placeholder|loading|next|prev|previous|play|pause|mute|share|download|upload|check|tick|cross|star|home|back|forward|left|right|up|down|zoom|edit|delete|add|remove|yes|no|ok|cancel|submit|send|get|go|view|read|more|less|show|hide|open|bg|background|decoration|pattern|texture|shape|gradient|wave|line|dot|circle|square|triangle|avatar|profile|user|person|team|staff|people|speaker|judge|jury|panelist|moderator|chairman|ceo|cto|cmo|coo|vp|svp|director|manager|head|lead|founder|co.founder|president|trustee|advisor|volunteer|delegate|attendee|visitor|exhibitor.logo|partner.logo|sponsor.logo|client.logo|brand.logo|company.logo|organisation.logo|organization.logo|\d+|\s*)$/i
  const LOOKS_LIKE_BRAND = /^[A-Z0-9][A-Za-z0-9\s\.\-\&\,\'\"\/\(\)]{1,59}$/
  const alts: string[] = []
  let searchHtml = html
  let offset = 0
  while (offset < html.length) {
    const match = SECTION_SIGNALS.exec(searchHtml)
    if (!match) break
    const blockStart = Math.max(0, offset + match.index - 1500)
    const blockEnd   = Math.min(html.length, offset + match.index + 1500)
    const block      = html.slice(blockStart, blockEnd)
    const imgRe = /<img[^>]+alt=["']([^"']{2,70})["'][^>]*>/gi
    let imgMatch
    while ((imgMatch = imgRe.exec(block)) !== null) {
      const raw = imgMatch[1].trim()
      if (!JUNK.test(raw) && LOOKS_LIKE_BRAND.test(raw) && raw.split(' ').length <= 8) {
        alts.push(raw)
      }
    }
    offset += match.index + 1
    searchHtml = html.slice(offset)
  }
  return [...new Set(alts)]
}

type FetchResult = { text: string; method: 'direct' | 'jina' | 'firecrawl' | 'none'; altTexts: string[] }
type Credits = { gemini: number; firecrawl: number; jina: number }

async function smartFetch(url: string, credits: Credits): Promise<FetchResult> {
  const html = await fetchPage(url)
  const rawText = html ? stripHtml(html) : ''
  const altTexts = html ? extractImageAltText(html) : []
  if (rawText.length >= 800) return { text: rawText, method: 'direct', altTexts }
  const jina = await fetchViaJina(url)
  if (!jina.rateLimited && jina.text.length > rawText.length) {
    credits.jina++
    return { text: jina.text, method: 'jina', altTexts }
  }
  const firecrawlText = await fetchViaFirecrawl(url)
  if (firecrawlText.length > rawText.length) {
    credits.firecrawl++
    return { text: firecrawlText, method: 'firecrawl', altTexts }
  }
  return { text: rawText || jina.text || firecrawlText, method: rawText.length > 0 ? 'direct' : 'none', altTexts }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const re = /href=["']([^"'\s#?][^"'\s]*)["']/gi
  const seen = new Set<string>()
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const href = m[1]
      let full: string
      if (href.startsWith('http')) full = href
      else if (href.startsWith('/')) full = base.origin + href
      else continue
      const u = new URL(full)
      if (u.hostname !== base.hostname) continue
      const clean = u.origin + u.pathname.replace(/\/$/, '')
      if (clean && !seen.has(clean)) seen.add(clean)
    } catch { /* skip */ }
  }
  return [...seen]
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function scoreLink(url: string): number {
  const lower = url.toLowerCase()
  let score = 0
  for (const kw of COMMERCIAL_SIGNALS) if (lower.includes(kw)) score += 12
  for (const kw of SKIP_SIGNALS)        if (lower.includes(kw)) score -= 20
  const depth = (url.split('/').length - 3)
  score -= depth * 2
  return score
}

function classifySite(html: string, text: string) {
  const lower = text.toLowerCase()
  const terminology: string[] = []
  const commercialIndicators: string[] = []
  const termMap: Record<string, string> = {
    'sponsor': 'sponsors', 'exhibitor': 'exhibitors', 'partner': 'partners',
    'supporter': 'supporters', 'knowledge partner': 'knowledge partners',
    'media partner': 'media partners', 'strategic partner': 'strategic partners',
    'powered by': 'powered by', 'in association': 'in association with',
    'ecosystem': 'ecosystem partners', 'community partner': 'community partners',
  }
  for (const [kw, label] of Object.entries(termMap)) {
    if (lower.includes(kw)) terminology.push(label)
  }
  if (lower.match(/platinum|gold|silver|bronze|diamond/)) commercialIndicators.push('tiered sponsorship structure detected')
  if (lower.match(/booth|stand|floor plan/))               commercialIndicators.push('exhibition floor structure detected')
  if (lower.match(/logo/))                                  commercialIndicators.push('logo grid likely present')
  if (html.match(/loading="lazy"|data-src=/i))             commercialIndicators.push('lazy-loaded content detected')
  const renderingHints: string[] = []
  if (html.includes('__next'))    renderingHints.push('Next.js')
  if (html.includes('nuxt'))      renderingHints.push('Nuxt.js')
  if (html.includes('gatsby'))    renderingHints.push('Gatsby')
  if (html.includes('wp-content')) renderingHints.push('WordPress')
  if (renderingHints.length === 0) renderingHints.push('Static HTML')
  return { terminology, renderingHints, commercialIndicators }
}

// ── Aggregate job stats after each scan completes ─────────────────────────────
async function aggregateJobStats(jobId: string) {
  const { data } = await supabaseAdmin
    .from('market_intel_scans')
    .select('status, participants_found, speakers_found, credits_gemini_calls, credits_firecrawl_pages, credits_jina_pages, partial_failures')
    .eq('job_id', jobId)

  if (!data || data.length === 0) return

  const completed = data.filter((s: { status: string }) => s.status === 'complete').length
  const failed    = data.filter((s: { status: string }) => s.status === 'failed').length
  const total     = data.length
  const allDone   = completed + failed === total

  const sum = (field: string) =>
    data.reduce((acc: number, s: Record<string, number>) => acc + (s[field] ?? 0), 0)

  const allPartialFailures = data
    .flatMap((s: { partial_failures?: unknown[] }) => s.partial_failures ?? [])

  await supabaseAdmin.from('market_intel_jobs').update({
    completed_urls:          completed,
    failed_urls:             failed,
    participants_found:      sum('participants_found'),
    speakers_found:          sum('speakers_found'),
    credits_gemini_calls:    sum('credits_gemini_calls'),
    credits_firecrawl_pages: sum('credits_firecrawl_pages'),
    credits_jina_pages:      sum('credits_jina_pages'),
    partial_failures:        allPartialFailures,
    ...(allDone ? { status: failed === total ? 'failed' : 'complete', completed_at: new Date().toISOString() } : {}),
  }).eq('id', jobId)
}

// ── GET — fetch companies + speakers for event/scan/job ───────────────────────
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const scanId  = req.nextUrl.searchParams.get('scan_id')
  const jobId   = req.nextUrl.searchParams.get('job_id')

  if (!eventId && !scanId && !jobId) {
    return NextResponse.json({ error: 'event_id, scan_id, or job_id required' }, { status: 400 })
  }

  const denied = await requireMarketIntelAccess({ eventId, scanId, jobId })
  if (denied) return denied

  // Companies
  let cq = supabaseAdmin.from('market_intel_companies').select('*').eq('is_duplicate', false)
  if (jobId)   cq = supabaseAdmin.from('market_intel_companies').select('*').eq('is_duplicate', false)
  if (scanId)  cq = cq.eq('scan_id', scanId)
  else if (jobId) {
    // get scan_ids for this job
    const { data: scans } = await supabaseAdmin.from('market_intel_scans').select('id').eq('job_id', jobId)
    const scanIds = (scans ?? []).map((s: { id: string }) => s.id)
    if (scanIds.length > 0) cq = cq.in('scan_id', scanIds)
    else cq = cq.eq('scan_id', 'none')
  } else if (eventId) {
    cq = cq.eq('event_id', eventId)
  }
  const { data: companies, error: cErr } = await cq.order('created_at', { ascending: false })
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Speakers
  let sq = supabaseAdmin.from('market_intel_speakers').select('*').eq('is_duplicate', false)
  if (scanId)  sq = sq.eq('scan_id', scanId)
  else if (jobId) sq = sq.eq('job_id', jobId)
  else if (eventId) sq = sq.eq('event_id', eventId)
  const { data: speakers } = await sq.order('created_at', { ascending: false })

  // Scans
  let scansQ = supabaseAdmin.from('market_intel_scans').select('*')
  if (jobId)   scansQ = scansQ.eq('job_id', jobId)
  else if (eventId) scansQ = scansQ.eq('event_id', eventId)
  if (scanId)  scansQ = scansQ.eq('id', scanId)
  const { data: scans } = await scansQ.order('created_at', { ascending: false })

  return NextResponse.json({ companies: companies ?? [], speakers: speakers ?? [], scans: scans ?? [] })
}

/* POST /api/market-intel — Body: { url, event_id?, job_id?, is_fresh_rescan? }
   BACKGROUND-JOB-BACKED (2026-08-24 — same fix shape as
   app/api/events/stakeholders/speakers/[id]/clean-photo/generate/route.ts
   and app/api/kb/intel/run/route.ts; read either's doc comment for the full
   incident writeup). This used to await the ENTIRE scan pipeline inline —
   up to 20 page fetches, an 8-page level-2 crawl (the level-2 discovery loop
   in particular runs its fetchPage calls SEQUENTIALLY, not in parallel), and
   a Gemini call retried across up to 4 model fallbacks on a ~100k-char
   prompt. That worked fine in local dev, where eventpilot.tresconglobal.com's
   Cloudflare Worker proxy isn't in the request path at all — but live, EVERY
   request to this route (whether from the browser's scanManager.ts or any
   other caller) passes through that same proxy, which kills any single
   request/response around ~100s regardless of maxDuration above (that's a
   Next.js/platform setting; it does nothing against Cloudflare's own,
   independent limit). A single URL's scan chain can easily exceed that.

   market_intel_scans already tracked status ('running'/'complete'/'failed')
   per scan even before this change — this reuses that same row instead of
   adding a new table. POST now just creates the row and fires the real
   pipeline (runMarketIntelScan, below) as a detached background function
   without awaiting it, returning { scan_id, status: 'running' } immediately
   (safe here — Railway runs this as a persistent `next start` process, not
   a serverless function torn down after the response). Callers poll
   GET /api/market-intel?scan_id=... (already existed, unchanged) until the
   scan's status leaves 'running', then read scan.result — the EXACT same
   JSON shape this route used to return inline — and scan.error_message /
   scan.failure_reason on failure. See app/lib/scanManager.ts, which is the
   only caller today, for the poll loop. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.url) return NextResponse.json({ error: 'url required', failure_reason: 'invalid_request' }, { status: 400 })

  let rawUrl = body.url.trim().replace(/\/$/, '')
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = 'https://' + rawUrl
  }
  const targetUrl     = rawUrl
  const eventId       = body.event_id ?? null
  const jobId         = body.job_id ?? null
  const isFreshRescan = body.is_fresh_rescan === true

  const denied = await requireMarketIntelAccess({ eventId, jobId })
  if (denied) return denied

  const { data: scanRow, error: scanErr } = await supabaseAdmin
    .from('market_intel_scans')
    .insert({ source_url: targetUrl, event_id: eventId, job_id: jobId, status: 'running', is_fresh_rescan: isFreshRescan })
    .select('id')
    .single()
  if (scanErr || !scanRow) {
    return NextResponse.json({ error: scanErr?.message ?? 'Could not start scan', failure_reason: 'network' }, { status: 500 })
  }

  // Fire and forget — see this file's top doc comment for why this is safe
  // here. runMarketIntelScan handles its own success/failure DB writes
  // internally (mirroring exactly what this route used to do inline); this
  // outer .catch is only a backstop for a genuinely uncaught bug in that
  // handling itself.
  runMarketIntelScan(scanRow.id, targetUrl, eventId, jobId).catch(async e => {
    console.error(`[market-intel scan ${scanRow.id}] uncaught error:`, e)
    await supabaseAdmin.from('market_intel_scans').update({
      status: 'failed', error_message: String(e), failure_reason: 'ai', completed_at: new Date().toISOString(),
    }).eq('id', scanRow.id)
    if (jobId) await aggregateJobStats(jobId).catch(() => {})
  })

  return NextResponse.json({ scan_id: scanRow.id, status: 'running' })
}

// The actual scan pipeline, run detached from the request/response cycle
// (see this file's top doc comment). Identical logic to what this route
// used to run inline — only the entry/exit points changed: no NextResponse,
// writes its outcome (success or failure) to the market_intel_scans row the
// caller already created instead of returning it.
async function runMarketIntelScan(scanId: string, targetUrl: string, eventId: string | null, jobId: string | null) {
  const credits: Credits = { gemini: 0, firecrawl: 0, jina: 0 }

  try {
    // ── Phase A: Reconnaissance ────────────────────────────────────────────────
    const homepageHtml = await fetchPage(targetUrl)
    const rawHomepageText = homepageHtml ? stripHtml(homepageHtml) : ''
    let homepageJina = ''
    if (rawHomepageText.length < 800) {
      const jina = await fetchViaJina(targetUrl)
      if (!jina.rateLimited && jina.text.length > rawHomepageText.length) {
        homepageJina = jina.text
        credits.jina++
      } else {
        const fc = await fetchViaFirecrawl(targetUrl)
        if (fc.length > rawHomepageText.length) {
          homepageJina = fc
          credits.firecrawl++
        }
      }
    }
    const homepageText    = rawHomepageText || homepageJina
    const homepageAltTexts = homepageHtml ? extractImageAltText(homepageHtml) : []

    if (!homepageText) {
      await supabaseAdmin.from('market_intel_scans').update({
        status: 'failed',
        error_message: 'Could not reach URL',
        failure_reason: 'network',
        completed_at: new Date().toISOString(),
      }).eq('id', scanId)
      if (jobId) await aggregateJobStats(jobId)
      return
    }

    const siteClass = classifySite(homepageHtml, homepageText)
    const allLinks  = extractLinks(homepageHtml, targetUrl)

    // ── Phase B: Page discovery ────────────────────────────────────────────────
    const base = new URL(targetUrl)
    const forcedCommercial = FORCED_PATHS.map(p => `${base.origin}${p}`).filter(u => !allLinks.includes(u))
    const forcedSpeaker    = SPEAKER_PATHS.map(p => `${base.origin}${p}`).filter(u => !allLinks.includes(u))
    const sitemapUrls      = await fetchSitemapUrls(targetUrl)
    const sitemapCommercial = sitemapUrls.filter(u => scoreLink(u) > 0).sort((a, b) => scoreLink(b) - scoreLink(a)).slice(0, 10)

    const ranked = [...new Set([...allLinks, ...sitemapCommercial])]
      .map(url => ({ url, score: scoreLink(url) }))
      .filter(l => l.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    const hypotheses = ranked.slice(0, 5).map(l => ({
      url: l.url,
      reasoning: `Score ${l.score} — URL pattern suggests commercial participation content`,
      confidence: Math.min(0.95, 0.5 + l.score / 100),
    }))

    // ── Phase C: Fetch commercial + speaker pages ──────────────────────────────
    const pagesToFetch = [
      ...forcedCommercial.slice(0, 6),
      ...forcedSpeaker.slice(0, 4),
      ...ranked.slice(0, 10).map(l => l.url),
    ].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 20)

    const subPages = await Promise.all(
      pagesToFetch.map(async url => {
        const { text, method, altTexts } = await smartFetch(url, credits)
        return text ? { url, text: text.slice(0, 14000), method, altTexts } : null
      })
    )
    const fetchedPages = subPages.filter(Boolean) as { url: string; text: string; method: string; altTexts: string[] }[]

    // Level-2 crawl
    const level2Seen = new Set<string>(pagesToFetch)
    level2Seen.add(targetUrl)
    const level2Candidates: string[] = []
    for (const page of fetchedPages.slice(0, 8)) {
      const rawHtml = await fetchPage(page.url)
      if (!rawHtml) continue
      const subLinks = extractLinks(rawHtml, targetUrl)
      for (const link of subLinks) {
        if (!level2Seen.has(link) && scoreLink(link) > 0) {
          level2Candidates.push(link)
          level2Seen.add(link)
        }
      }
    }
    const level2Pages = await Promise.all(
      level2Candidates.map(u => ({ url: u, score: scoreLink(u) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(async ({ url }) => {
          const { text, method, altTexts } = await smartFetch(url, credits)
          return text ? { url, text: text.slice(0, 10000), method, altTexts } : null
        })
    )
    const fetchedLevel2 = level2Pages.filter(Boolean) as { url: string; text: string; method: string; altTexts: string[] }[]
    fetchedPages.push(...fetchedLevel2)

    const allAltTexts = [...new Set([...homepageAltTexts, ...fetchedPages.flatMap(p => p.altTexts)])]

    // ── Phase D: AI Extraction ─────────────────────────────────────────────────
    const contentBlocks = [
      `=== HOMEPAGE (${targetUrl}) ===\n${(homepageJina || homepageText).slice(0, 20000)}`,
      ...fetchedPages.map(p => `=== PAGE [${p.method}]: ${p.url} ===\n${p.text}`),
    ].join('\n\n').slice(0, 100000)

    const siteMeta = JSON.stringify({
      terminology_detected:      siteClass.terminology,
      rendering_hints:           siteClass.renderingHints,
      commercial_indicators:     siteClass.commercialIndicators,
      pages_fetched:             fetchedPages.length + 1,
      image_alt_texts_extracted: allAltTexts.length,
    })

    const altTextBlock = allAltTexts.length > 0
      ? `\n\nIMAGE ALT TEXTS (company names from logo images):\n${allAltTexts.join('\n')}`
      : ''

    const prompt = `You are an elite commercial intelligence analyst. Analyze this event website and extract all commercial participants AND speakers.

SITE METADATA:
${siteMeta}

WEBSITE CONTENT:
${contentBlocks}${altTextBlock}

EXTRACTION RULES — COMPANIES:
- Extract EVERY company: sponsor, exhibitor, partner, supporter, media partner, knowledge partner, ecosystem partner
- Use canonical names (e.g. "Amazon Web Services" not "AWS")
- Set confidence: 0.9+ for explicitly named, 0.7+ for alt-text extracted, 0.5+ for speaker-inferred
- description = one sentence: what the company does (products/solutions)
- company_linkedin_url = LinkedIn company page URL only if clearly visible on the site

EXTRACTION RULES — SPEAKERS:
- Extract every named speaker, keynote presenter, panelist, moderator, session chair
- Include job_title, speaker_company, speaker_company_url (website), linkedin_url
- Only include speakers where at minimum their name is visible; fill other fields only if found
- confidence: 0.9 if full profile visible, 0.7 if name+company only

Do NOT hallucinate. Only include entries with at least one piece of evidence.

Return ONLY valid JSON:

{
  "event": {
    "name": "full event name",
    "edition": "year or edition",
    "industry": "primary industry",
    "location": "city, country",
    "website": "${targetUrl}",
    "organizer": "organizer name or null"
  },
  "site_analysis": {
    "site_type": "conference|exhibition|summit|forum|awards|expo|other",
    "rendering_model": "static|wordpress|nextjs|nuxt|custom-cms",
    "commercial_structure": "one sentence",
    "terminology_used": ["terms found"],
    "information_richness": "high|medium|low",
    "extraction_challenges": "brief note on what made extraction harder",
    "pages_analyzed": ${fetchedPages.length + 1}
  },
  "hypotheses": [
    { "hypothesis": "what you expected", "validated": true, "finding": "what you found" }
  ],
  "participants": [
    {
      "company_name": "Canonical Company Name",
      "official_domain": "domain.com or null",
      "company_website": "https://domain.com or null",
      "company_linkedin_url": "https://linkedin.com/company/... or null",
      "description": "One sentence describing what this company does",
      "participant_type": "sponsor|exhibitor|partner|media_partner|knowledge_partner|supporter|technology_partner|other",
      "tier": "platinum|gold|silver|bronze|diamond|strategic|associate|general|null",
      "sponsorship_category": "technology|finance|media|government|automotive|healthcare|other|null",
      "contact_email": "email or null",
      "contact_name": "contact person name or null",
      "contact_title": "contact person title or null",
      "contact_linkedin": "linkedin url or null",
      "hq_location": "city, country or null",
      "hq_country": "country or null",
      "industry_sector": "industry or null",
      "company_size": "startup|sme|enterprise|global|null",
      "confidence": 0.95,
      "evidence": ["source: page URL or section name"],
      "extraction_method": "explicit_text|image_alt_text|section_heading|speaker_inference|contextual_inference"
    }
  ],
  "speakers": [
    {
      "speaker_name": "Full Name",
      "job_title": "title or null",
      "speaker_company": "company name or null",
      "speaker_company_url": "https://... or null",
      "linkedin_url": "https://linkedin.com/in/... or null",
      "confidence": 0.9,
      "evidence": ["source page or section"]
    }
  ],
  "intelligence_summary": "3-4 sentence strategic summary including extraction challenges, what was found vs image-only, commercial positioning",
  "crawl_summary": {
    "homepage_analyzed": true,
    "sub_pages_fetched": ${fetchedPages.length},
    "level2_pages_fetched": ${fetchedLevel2.length},
    "total_links_discovered": ${allLinks.length},
    "image_alt_texts_found": ${allAltTexts.length},
    "total_participants_extracted": 0,
    "total_speakers_extracted": 0
  }
}`

    let result
    for (const modelName of ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash-latest']) {
      try {
        result = await genAI.getGenerativeModel({ model: modelName }).generateContent(prompt)
        credits.gemini++
        break
      } catch (e: unknown) {
        const msg = String(e)
        if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) continue
        throw e
      }
    }
    if (!result) throw new Error('All Gemini models are currently unavailable. Please try again.')

    const raw = result.response.text().trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in AI response')

    const parsed = JSON.parse(jsonMatch[0])
    const participants: Record<string, unknown>[] = parsed.participants ?? []
    const speakers: Record<string, unknown>[]     = parsed.speakers ?? []
    parsed.crawl_summary.total_participants_extracted = participants.length
    parsed.crawl_summary.total_speakers_extracted     = speakers.length

    // ── Partial failures tracking ──────────────────────────────────────────────
    const partialFailures: { type: string; potential: number; extracted: number; reason: string }[] = []
    const altTextCompanyGap = allAltTexts.length - participants.length
    if (allAltTexts.length > 4 && altTextCompanyGap > 4) {
      partialFailures.push({
        type: 'companies',
        potential: allAltTexts.length,
        extracted: participants.length,
        reason: `${altTextCompanyGap} potential companies detected via logo alt-text but could not be matched — possible causes: non-Latin script, overly generic image labels, or ambiguous brand names`,
      })
    }
    if (parsed.site_analysis?.extraction_challenges && parsed.site_analysis.extraction_challenges.length > 10) {
      partialFailures.push({
        type: 'general',
        potential: 0,
        extracted: 0,
        reason: parsed.site_analysis.extraction_challenges,
      })
    }

    // Exact same shape this route used to return inline — persisted verbatim
    // so pollers (see this file's top doc comment) read an identical result.
    const responsePayload = {
      ...parsed,
      hypotheses_generated: hypotheses,
      scan_id: scanId,
      credits: { gemini: credits.gemini, firecrawl: credits.firecrawl, jina: credits.jina },
      partial_failures: partialFailures,
    }

    // ── Save to Supabase ───────────────────────────────────────────────────────
    // This write is now the ONLY way a poller ever learns the scan
    // succeeded (2026-08-24 — previously this route returned responsePayload
    // directly too, so a silent failure here still left the caller with its
    // data; now scanManager.ts learns the outcome exclusively by polling
    // this row). Checked and thrown so a failure here is treated as a scan
    // failure by the outer catch below, instead of leaving the row stuck at
    // 'running' until the poller's multi-minute ceiling times out.
    const { error: saveError } = await supabaseAdmin.from('market_intel_scans').update({
      event_name:              parsed.event?.name ?? null,
      industry:                parsed.event?.industry ?? null,
      location:                parsed.event?.location ?? null,
      organizer:               parsed.event?.organizer ?? null,
      site_type:                parsed.site_analysis?.site_type ?? null,
      rendering_model:         parsed.site_analysis?.rendering_model ?? null,
      commercial_structure:    parsed.site_analysis?.commercial_structure ?? null,
      terminology_used:        parsed.site_analysis?.terminology_used ?? [],
      intelligence_summary:    parsed.intelligence_summary ?? null,
      pages_scanned:           (parsed.crawl_summary?.sub_pages_fetched ?? 0) + 1,
      participants_found:      participants.length,
      speakers_found:          speakers.length,
      partial_failures:        partialFailures,
      credits_gemini_calls:    credits.gemini,
      credits_firecrawl_pages: credits.firecrawl,
      credits_jina_pages:      credits.jina,
      status:                  'complete',
      completed_at:            new Date().toISOString(),
      result:                  responsePayload,
    }).eq('id', scanId)
    if (saveError) throw new Error(`Could not save scan result: ${saveError.message}`)

    // ── Upsert companies ───────────────────────────────────────────────────────
    if (eventId && participants.length > 0) {
      for (const p of participants) {
        const name = String(p.company_name ?? '').trim()
        if (!name) continue
        const row = {
          scan_id:              scanId,
          event_id:             eventId,
          company_name:         name,
          canonical_name:       name,
          official_domain:      p.official_domain ?? null,
          company_website:      p.company_website ?? null,
          company_linkedin_url: p.company_linkedin_url ?? null,
          description:          p.description ?? null,
          participant_type:     p.participant_type ?? null,
          tier:                 p.tier === 'null' ? null : (p.tier ?? null),
          sponsorship_category: p.sponsorship_category ?? null,
          contact_email:        p.contact_email ?? null,
          contact_name:         p.contact_name ?? null,
          contact_title:        p.contact_title ?? null,
          contact_linkedin:     p.contact_linkedin ?? null,
          hq_location:          p.hq_location ?? null,
          hq_country:           p.hq_country ?? null,
          industry_sector:      p.industry_sector ?? null,
          company_size:         p.company_size ?? null,
          confidence:           p.confidence ?? null,
          evidence:             p.evidence ?? [],
          extraction_method:    p.extraction_method ?? null,
          source_page_url:      targetUrl,
        }
        // Check if already exists
        const { data: existing } = await supabaseAdmin
          .from('market_intel_companies')
          .select('id')
          .eq('event_id', eventId)
          .ilike('company_name', name)
          .limit(1)
          .single()
        if (existing) {
          await supabaseAdmin.from('market_intel_companies')
            .update({ ...row, modified_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          await supabaseAdmin.from('market_intel_companies').insert(row)
        }
      }
    }

    // ── Upsert speakers ────────────────────────────────────────────────────────
    if (eventId && speakers.length > 0) {
      for (const s of speakers) {
        const name = String(s.speaker_name ?? '').trim()
        if (!name) continue
        const row = {
          scan_id:            scanId,
          job_id:             jobId,
          event_id:           eventId,
          speaker_name:       name,
          job_title:          s.job_title ?? null,
          speaker_company:    s.speaker_company ?? null,
          speaker_company_url: s.speaker_company_url ?? null,
          linkedin_url:       s.linkedin_url ?? null,
          confidence:         s.confidence ?? null,
          evidence:           s.evidence ?? [],
          source_page_url:    targetUrl,
        }
        const { data: existing } = await supabaseAdmin
          .from('market_intel_speakers')
          .select('id')
          .eq('event_id', eventId)
          .ilike('speaker_name', name)
          .limit(1)
          .single()
        if (existing) {
          await supabaseAdmin.from('market_intel_speakers')
            .update({ ...row, modified_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          await supabaseAdmin.from('market_intel_speakers').insert(row)
        }
      }
    }

    // ── Update job aggregate ───────────────────────────────────────────────────
    if (jobId) await aggregateJobStats(jobId)

  } catch (e) {
    console.error('market-intel error:', e)
    const msg = String(e)
    const failure_reason = msg.includes('network') || msg.includes('fetch') ? 'network'
      : msg.includes('JSON') || msg.includes('parse') ? 'parse'
      : msg.includes('rate') || msg.includes('quota') ? 'rate_limit'
      : msg.includes('timeout') || msg.includes('abort') ? 'timeout'
      : 'ai'
    await supabaseAdmin.from('market_intel_scans').update({
      status: 'failed', error_message: msg, failure_reason, completed_at: new Date().toISOString(),
    }).eq('id', scanId)
    if (jobId) await aggregateJobStats(jobId).catch(() => {})
  }
}
