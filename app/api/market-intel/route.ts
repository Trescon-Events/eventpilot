import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
  // Prefer shorter paths (closer to root)
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
  if (html.match(/react|nextjs|__next/i))                  commercialIndicators.push('JS-rendered site — may have dynamic content')

  const renderingHints: string[] = []
  if (html.includes('__next'))    renderingHints.push('Next.js')
  if (html.includes('nuxt'))      renderingHints.push('Nuxt.js')
  if (html.includes('gatsby'))    renderingHints.push('Gatsby')
  if (html.includes('wp-content')) renderingHints.push('WordPress')
  if (renderingHints.length === 0) renderingHints.push('Static HTML')

  return { terminology, renderingHints, commercialIndicators }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const targetUrl = body.url.trim().replace(/\/$/, '')

  // ── Phase A: Reconnaissance ──────────────────────────────────────────────────
  const homepageHtml = await fetchPage(targetUrl)
  if (!homepageHtml) {
    return NextResponse.json({
      error: 'Could not reach this URL. The site may block automated access or the URL is incorrect.',
    }, { status: 422 })
  }

  const homepageText = stripHtml(homepageHtml)
  const siteClass    = classifySite(homepageHtml, homepageText)
  const allLinks     = extractLinks(homepageHtml, targetUrl)

  // ── Phase B: Hypothesis — score and rank sub-pages ───────────────────────────
  const ranked = allLinks
    .map(url => ({ url, score: scoreLink(url) }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  const hypotheses = ranked.slice(0, 5).map(l => ({
    url: l.url,
    reasoning: `Score ${l.score} — URL pattern suggests commercial participation content`,
    confidence: Math.min(0.95, 0.5 + l.score / 100),
  }))

  // ── Phase C: Adaptive Exploration — fetch top pages ──────────────────────────
  const pagesToFetch = ranked.slice(0, 10).map(l => l.url)
  const subPages = await Promise.all(
    pagesToFetch.map(async url => {
      const html = await fetchPage(url)
      const text = html ? stripHtml(html) : ''
      return text ? { url, text: text.slice(0, 12000) } : null
    })
  )
  const fetchedPages = subPages.filter(Boolean) as { url: string; text: string }[]

  // ── Phase D: AI Extraction ───────────────────────────────────────────────────
  const contentBlocks = [
    `=== HOMEPAGE (${targetUrl}) ===\n${homepageText.slice(0, 20000)}`,
    ...fetchedPages.map(p => `=== PAGE: ${p.url} ===\n${p.text}`),
  ].join('\n\n').slice(0, 90000)

  const siteMeta = JSON.stringify({
    terminology_detected:       siteClass.terminology,
    rendering_hints:            siteClass.renderingHints,
    commercial_indicators:      siteClass.commercialIndicators,
    pages_fetched:              fetchedPages.length + 1,
    commercial_pages_attempted: pagesToFetch.length,
  })

  const prompt = `You are an elite commercial intelligence analyst. Analyze this event website and extract all commercial participants with maximum precision.

SITE METADATA (pre-analysis):
${siteMeta}

WEBSITE CONTENT:
${contentBlocks}

EXTRACTION RULES:
- Extract EVERY company that appears as a sponsor, exhibitor, partner, supporter, media partner, knowledge partner, ecosystem partner, or any commercial association
- Canonical company names (e.g. "Amazon Web Services" not "AWS")
- Infer tier from visual hierarchy, section headings, or ordering cues
- Set confidence based on how explicitly the company is named vs inferred
- Only include companies you are genuinely confident exist on this site
- Do NOT hallucinate companies not present in the content

Return ONLY valid JSON — no markdown, no explanation, just the JSON object:

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
    "commercial_structure": "one sentence describing how sponsors/partners are organized on this site",
    "terminology_used": ["exact terms found on site"],
    "information_richness": "high|medium|low",
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
      "official_domain": "domain.com",
      "participant_type": "sponsor|exhibitor|partner|media_partner|knowledge_partner|supporter|technology_partner|other",
      "tier": "platinum|gold|silver|bronze|diamond|strategic|associate|general|null",
      "confidence": 0.95,
      "evidence": ["list specific evidence: page URL, section heading, exact text found"],
      "extraction_method": "explicit_text|section_heading|link_analysis|contextual_inference"
    }
  ],
  "intelligence_summary": "3-4 sentence strategic summary of the commercial participation landscape, notable patterns, and what this reveals about the event's positioning",
  "crawl_summary": {
    "homepage_analyzed": true,
    "sub_pages_fetched": ${fetchedPages.length},
    "total_links_discovered": ${allLinks.length},
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
        if (msg.includes('503') || msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) continue
        throw e
      }
    }
    if (!result) throw new Error('All Gemini models are currently unavailable. Please try again in a moment.')
    const raw    = result.response.text().trim()

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in AI response')

    const parsed = JSON.parse(jsonMatch[0])
    parsed.crawl_summary.total_participants_extracted = parsed.participants?.length ?? 0

    return NextResponse.json({ ...parsed, hypotheses_generated: hypotheses })
  } catch (e) {
    console.error('market-intel AI error:', e)
    return NextResponse.json({ error: 'AI extraction failed: ' + String(e) }, { status: 500 })
  }
}
