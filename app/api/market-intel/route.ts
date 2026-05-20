import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// Keywords that signal commercial participation pages
const COMMERCIAL_SIGNALS = [
  'sponsor', 'exhibitor', 'partner', 'supporter', 'backer', 'pavilion',
  'powered-by', 'association', 'affiliate', 'vendor', 'booth',
  'platinum', 'gold', 'silver', 'bronze', 'strategic', 'media-partner',
  'knowledge-partner', 'community-partner', 'ecosystem',
]

// Keywords that indicate noise pages to skip
const SKIP_SIGNALS = [
  'blog', 'news', 'press', 'careers', 'jobs', 'contact', 'privacy',
  'terms', 'cookie', 'sitemap', 'login', 'register', 'signup', 'faq',
]

// Common sponsor/partner paths to always try
const FORCED_PATHS = [
  '/sponsors', '/sponsor', '/partners', '/partner', '/exhibitors', '/exhibitor',
  '/our-partners', '/our-sponsors', '/sponsorship', '/about/sponsors',
  '/about/partners', '/supporters', '/ecosystem', '/media-partners',
  '/knowledge-partners', '/presenting-partners',
]

// ── Fetch with plain HTML ──────────────────────────────────────────────────────
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

// ── Jina Reader — JS-rendered fallback ────────────────────────────────────────
// Jina.ai renders the page server-side and returns clean markdown.
// Used when direct fetch yields thin content (< 800 chars after stripping).
async function fetchViaJina(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Timeout': '15',
      },
      signal: AbortSignal.timeout(18000),
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

// ── Sitemap parser ────────────────────────────────────────────────────────────
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

// ── Alt text extraction from image logo grids ─────────────────────────────────
function extractImageAltText(html: string): string[] {
  const alts: string[] = []
  // Look for img tags with meaningful alt text (>2 chars, not generic)
  const imgRe = /<img[^>]+alt=["']([^"']{3,80})["'][^>]*>/gi
  const generic = /^(logo|image|img|photo|icon|banner|slide|arrow|close|menu|search|placeholder|loading)$/i
  let m
  while ((m = imgRe.exec(html)) !== null) {
    const alt = m[1].trim()
    if (!generic.test(alt) && !/^\d+$/.test(alt)) {
      alts.push(alt)
    }
  }
  return [...new Set(alts)]
}

// ── Smart fetch: try direct, fallback to Jina if thin ────────────────────────
async function smartFetch(url: string): Promise<{ text: string; method: 'direct' | 'jina' | 'none'; altTexts: string[] }> {
  const html = await fetchPage(url)
  const rawText = html ? stripHtml(html) : ''
  const altTexts = html ? extractImageAltText(html) : []

  if (rawText.length >= 800) {
    return { text: rawText, method: 'direct', altTexts }
  }

  // Too thin — try Jina Reader for JS-rendered content
  const jinaText = await fetchViaJina(url)
  if (jinaText.length > rawText.length) {
    return { text: jinaText, method: 'jina', altTexts }
  }

  return { text: rawText || jinaText, method: rawText.length > 0 ? 'direct' : 'none', altTexts }
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
      if (href.startsWith('http')) {
        full = href
      } else if (href.startsWith('/')) {
        full = base.origin + href
      } else {
        continue
      }
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

function classifySite(html: string, text: string): {
  terminology: string[]
  renderingHints: string[]
  commercialIndicators: string[]
} {
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
  if (html.match(/react|nextjs|__next/i))                  commercialIndicators.push('JS-rendered site — Jina fallback used')

  const renderingHints: string[] = []
  if (html.includes('__next'))    renderingHints.push('Next.js')
  if (html.includes('nuxt'))      renderingHints.push('Nuxt.js')
  if (html.includes('gatsby'))    renderingHints.push('Gatsby')
  if (html.includes('wp-content')) renderingHints.push('WordPress')
  if (renderingHints.length === 0) renderingHints.push('Static HTML')

  return { terminology, renderingHints, commercialIndicators }
}

// ── GET — fetch saved companies for an event ───────────────────────────────────
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const scanId  = req.nextUrl.searchParams.get('scan_id')

  if (!eventId && !scanId) {
    return NextResponse.json({ error: 'event_id or scan_id required' }, { status: 400 })
  }

  let companiesQuery = supabaseAdmin.from('market_intel_companies').select('*')
  if (scanId)  companiesQuery = companiesQuery.eq('scan_id', scanId)
  if (eventId) companiesQuery = companiesQuery.eq('event_id', eventId)

  const { data: companies, error: cErr } = await companiesQuery
    .eq('is_duplicate', false)
    .order('created_at', { ascending: false })

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  let scansQuery = supabaseAdmin.from('market_intel_scans').select('*')
  if (eventId) scansQuery = scansQuery.eq('event_id', eventId)
  if (scanId)  scansQuery = scansQuery.eq('id', scanId)

  const { data: scans } = await scansQuery.order('created_at', { ascending: false })

  return NextResponse.json({ companies: companies ?? [], scans: scans ?? [] })
}

// ── POST — run a scan ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const targetUrl = body.url.trim().replace(/\/$/, '')
  const eventId   = body.event_id ?? null

  // ── Create scan record ───────────────────────────────────────────────────────
  const { data: scanRow, error: scanErr } = await supabaseAdmin
    .from('market_intel_scans')
    .insert({ source_url: targetUrl, event_id: eventId, status: 'running' })
    .select()
    .single()

  if (scanErr) console.warn('market_intel_scans insert failed:', scanErr?.message)
  const scanId = scanRow?.id ?? null

  // ── Phase A: Reconnaissance ──────────────────────────────────────────────────
  const homepageHtml  = await fetchPage(targetUrl)
  const homepageJina  = homepageHtml.length < 800 ? await fetchViaJina(targetUrl) : ''
  const homepageText  = homepageHtml ? stripHtml(homepageHtml) : homepageJina
  const homepageAltTexts = homepageHtml ? extractImageAltText(homepageHtml) : []

  if (!homepageText && !homepageJina) {
    if (scanId) {
      await supabaseAdmin.from('market_intel_scans').update({
        status: 'failed', error_message: 'Could not reach URL', completed_at: new Date().toISOString(),
      }).eq('id', scanId)
    }
    return NextResponse.json({
      error: 'Could not reach this URL. The site may block automated access or the URL is incorrect.',
    }, { status: 422 })
  }

  const siteClass = classifySite(homepageHtml, homepageText)
  const allLinks  = extractLinks(homepageHtml, targetUrl)

  // ── Phase B: Sitemap discovery + forced paths + link scoring ─────────────────
  const base = new URL(targetUrl)

  // Forced commercial paths — always try these regardless of link discovery
  const forcedUrls = FORCED_PATHS
    .map(p => `${base.origin}${p}`)
    .filter(u => !allLinks.includes(u))

  // Sitemap-discovered URLs with commercial signals
  const sitemapUrls = await fetchSitemapUrls(targetUrl)
  const sitemapCommercial = sitemapUrls
    .filter(u => scoreLink(u) > 0)
    .sort((a, b) => scoreLink(b) - scoreLink(a))
    .slice(0, 10)

  // Score all discovered links
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

  // ── Phase C: Adaptive Exploration — fetch top scored + forced paths ───────────
  // Forced paths first (highest value), then scored links, deduplicated
  const pagesToFetch = [
    ...forcedUrls.slice(0, 6),
    ...ranked.slice(0, 12).map(l => l.url),
  ].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 18)

  const subPages = await Promise.all(
    pagesToFetch.map(async url => {
      const { text, method, altTexts } = await smartFetch(url)
      return text ? { url, text: text.slice(0, 14000), method, altTexts, html: '' } : null
    })
  )
  const fetchedPages = subPages.filter(Boolean) as { url: string; text: string; method: string; altTexts: string[]; html: string }[]

  // ── Phase C2: Second-level crawl — follow sub-links from commercial pages ────
  // For each high-value fetched page, extract its links and crawl promising sub-pages
  const level2Seen = new Set<string>(pagesToFetch)
  level2Seen.add(targetUrl)

  const level2Candidates: string[] = []
  for (const page of fetchedPages.slice(0, 8)) {
    // Re-fetch raw HTML to extract links (smartFetch may have used Jina text)
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

  // Score, deduplicate, fetch top second-level pages
  const level2ToFetch = level2Candidates
    .map(u => ({ url: u, score: scoreLink(u) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(l => l.url)

  const level2Pages = await Promise.all(
    level2ToFetch.map(async url => {
      const { text, method, altTexts } = await smartFetch(url)
      return text ? { url, text: text.slice(0, 10000), method, altTexts, html: '' } : null
    })
  )
  const fetchedLevel2 = level2Pages.filter(Boolean) as { url: string; text: string; method: string; altTexts: string[]; html: string }[]
  fetchedPages.push(...fetchedLevel2)

  // Collect all alt texts found across all pages
  const allAltTexts = [...new Set([
    ...homepageAltTexts,
    ...fetchedPages.flatMap(p => p.altTexts),
  ])]

  // ── Phase D: AI Extraction ───────────────────────────────────────────────────
  const contentBlocks = [
    `=== HOMEPAGE (${targetUrl}) ===\n${(homepageJina || homepageText).slice(0, 20000)}`,
    ...fetchedPages.map(p => `=== PAGE [${p.method}]: ${p.url} ===\n${p.text}`),
  ].join('\n\n').slice(0, 100000)

  const siteMeta = JSON.stringify({
    terminology_detected:       siteClass.terminology,
    rendering_hints:            siteClass.renderingHints,
    commercial_indicators:      siteClass.commercialIndicators,
    pages_fetched:              fetchedPages.length + 1,
    forced_paths_tried:         forcedUrls.length,
    sitemap_commercial_urls:    sitemapCommercial.length,
    image_alt_texts_extracted:  allAltTexts.length,
  })

  const altTextBlock = allAltTexts.length > 0
    ? `\n\nIMAGE ALT TEXTS (company names extracted from logo images — treat each as a potential participant):\n${allAltTexts.join('\n')}`
    : ''

  const prompt = `You are an elite commercial intelligence analyst. Analyze this event website and extract all commercial participants with maximum precision.

SITE METADATA (pre-analysis):
${siteMeta}

CRITICAL EXTRACTION NOTES:
- Many event sites render sponsor logos as images without visible text. Use the IMAGE ALT TEXTS section below — these are company names extracted directly from logo image tags.
- If a page uses JavaScript rendering and content seems sparse, cross-reference alt texts with section headings to infer tier placement.
- Infer sponsorship tier from visual ordering, section names, or font size hints in the text.
- If you find speaker affiliations from companies in sponsor/partner sections, treat those companies as commercial participants.
- Do NOT hallucinate. Only include companies with at least one piece of evidence.

WEBSITE CONTENT:
${contentBlocks}${altTextBlock}

EXTRACTION RULES:
- Extract EVERY company: sponsor, exhibitor, partner, supporter, media partner, knowledge partner, ecosystem partner, or any commercial association
- Use canonical company names (e.g. "Amazon Web Services" not "AWS")
- For each company, capture: official domain, contact email/name/title if visible, HQ location/country, industry sector, company size
- Set confidence: 0.9+ for explicitly named, 0.7+ for alt-text extracted, 0.5+ for speaker-inferred

Return ONLY valid JSON — no markdown, no explanation:

{
  "event": {
    "name": "full event name",
    "edition": "year or edition if visible",
    "industry": "primary industry/sector",
    "location": "city, country",
    "website": "${targetUrl}",
    "organizer": "organizer name if found"
  },
  "site_analysis": {
    "site_type": "conference|exhibition|summit|forum|awards|expo|other",
    "rendering_model": "static|wordpress|nextjs|nuxt|custom-cms",
    "commercial_structure": "one sentence describing how sponsors/partners are organized",
    "terminology_used": ["exact terms found on site"],
    "information_richness": "high|medium|low",
    "extraction_challenges": "brief note on what made extraction harder (image logos, JS rendering, etc.)",
    "pages_analyzed": ${fetchedPages.length + 1}
  },
  "hypotheses": [
    {
      "hypothesis": "what you expected to find",
      "validated": true,
      "finding": "what you actually found"
    }
  ],
  "participants": [
    {
      "company_name": "Canonical Company Name",
      "official_domain": "domain.com or null",
      "company_website": "https://domain.com or null",
      "participant_type": "sponsor|exhibitor|partner|media_partner|knowledge_partner|supporter|technology_partner|other",
      "tier": "platinum|gold|silver|bronze|diamond|strategic|associate|general|null",
      "sponsorship_category": "technology|finance|media|government|automotive|healthcare|other or null",
      "contact_email": "email if found or null",
      "contact_name": "contact person name if found or null",
      "contact_title": "contact person title if found or null",
      "contact_linkedin": "linkedin url if found or null",
      "hq_location": "city, country or null",
      "hq_country": "country name or null",
      "industry_sector": "primary industry of the company or null",
      "company_size": "startup|sme|enterprise|global or null",
      "confidence": 0.95,
      "evidence": ["source: page URL or section name, exact text or alt text found"],
      "extraction_method": "explicit_text|image_alt_text|section_heading|speaker_inference|contextual_inference"
    }
  ],
  "intelligence_summary": "3-4 sentence strategic summary including any extraction challenges, what was found vs what was image-only, and what this reveals about the event's commercial positioning",
  "crawl_summary": {
    "homepage_analyzed": true,
    "sub_pages_fetched": ${fetchedPages.length},
    "level2_pages_fetched": ${fetchedLevel2.length},
    "total_links_discovered": ${allLinks.length},
    "sitemap_urls_found": ${sitemapCommercial.length},
    "forced_paths_tried": ${forcedUrls.length},
    "image_alt_texts_found": ${allAltTexts.length},
    "commercial_signals_found": ${siteClass.commercialIndicators.length},
    "total_participants_extracted": 0
  }
}`

  try {
    let result
    for (const modelName of ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash-latest']) {
      try {
        result = await genAI.getGenerativeModel({ model: modelName }).generateContent(prompt)
        break
      } catch (e: unknown) {
        const msg = String(e)
        if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) continue
        throw e
      }
    }
    if (!result) throw new Error('All Gemini models are currently unavailable. Please try again in a moment.')
    const raw = result.response.text().trim()

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in AI response')

    const parsed = JSON.parse(jsonMatch[0])
    parsed.crawl_summary.total_participants_extracted = parsed.participants?.length ?? 0

    // ── Save to Supabase ─────────────────────────────────────────────────────
    if (scanId) {
      await supabaseAdmin.from('market_intel_scans').update({
        event_name:           parsed.event?.name ?? null,
        industry:             parsed.event?.industry ?? null,
        location:             parsed.event?.location ?? null,
        organizer:            parsed.event?.organizer ?? null,
        site_type:            parsed.site_analysis?.site_type ?? null,
        rendering_model:      parsed.site_analysis?.rendering_model ?? null,
        commercial_structure: parsed.site_analysis?.commercial_structure ?? null,
        terminology_used:     parsed.site_analysis?.terminology_used ?? [],
        intelligence_summary: parsed.intelligence_summary ?? null,
        pages_scanned:        (parsed.crawl_summary?.sub_pages_fetched ?? 0) + 1,
        participants_found:   parsed.participants?.length ?? 0,
        status:               'complete',
        completed_at:         new Date().toISOString(),
      }).eq('id', scanId)

      if (parsed.participants?.length > 0) {
        const companies = parsed.participants.map((p: Record<string, unknown>) => ({
          scan_id:              scanId,
          event_id:             eventId,
          company_name:         p.company_name,
          canonical_name:       p.company_name,
          official_domain:      p.official_domain ?? null,
          company_website:      p.company_website ?? null,
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
        }))
        await supabaseAdmin.from('market_intel_companies').insert(companies)
      }
    }

    return NextResponse.json({
      ...parsed,
      hypotheses_generated: hypotheses,
      scan_id: scanId,
    })
  } catch (e) {
    console.error('market-intel AI error:', e)
    if (scanId) {
      await supabaseAdmin.from('market_intel_scans').update({
        status: 'failed',
        error_message: String(e),
        completed_at: new Date().toISOString(),
      }).eq('id', scanId)
    }
    return NextResponse.json({ error: 'AI extraction failed: ' + String(e) }, { status: 500 })
  }
}
