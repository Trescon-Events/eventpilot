import * as cheerio from 'cheerio'

/* Speaker Proposals — reading one web page properly: its text AND its images. Firecrawl fetches (it gets past most bot walls); cheerio reads the HTML.
   The earlier research only used a page's text, so a conference speaker page with the person's photo and bio never contributed the photo.
   LinkedIn and other login-walled social sites are never fetched here. */

export type PageImage = { url: string; alt: string; width: number | null; height: number | null; near: string; kind: 'og' | 'img' }
export type FetchedPage = { url: string; title: string; markdown: string; images: PageImage[]; date: string | null; domain: string }

const NEVER_FETCH = /(^|\.)linkedin\.com$|(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)youtube\.com$|(^|\.)tiktok\.com$/i
const JUNK_IMG = /logo|icon|sprite|banner|favicon|placeholder|default[-_]?avatar|blank|pixel|tracking|spacer|badge|button|arrow|social|share|flag|emoji|loader|spinner|header-bg|background/i

// At most a few Firecrawl calls at once across everything running on this server (many speakers research in parallel).
let active = 0
const waiting: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>, max = 5): Promise<T> {
  while (active >= max) await new Promise<void>(r => waiting.push(r))
  active++
  try { return await fn() } finally { active--; waiting.shift()?.() }
}

export const domainOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }
export const canFetch = (url: string): boolean => { try { return !NEVER_FETCH.test(new URL(url).hostname) } catch { return false } }

/** Images on a page that could be this person's photo: the og/twitter image first, then content images with their nearby text. Pure function (testable). */
export function extractPageImages(html: string, baseUrl: string, max = 25): PageImage[] {
  const $ = cheerio.load(html)
  const abs = (src: string | undefined): string | null => {
    if (!src) return null
    const s = src.trim().split(/\s+/)[0]
    if (!s || s.startsWith('data:')) return null
    try { const u = new URL(s, baseUrl); return /^https?:$/.test(u.protocol) ? u.toString() : null } catch { return null }
  }
  const out: PageImage[] = []
  const seen = new Set<string>()
  const push = (img: PageImage) => { if (!seen.has(img.url) && !/\.(svg|gif|ico)(\?|$)/i.test(img.url)) { seen.add(img.url); out.push(img) } }
  for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="og:image:url"]']) {
    const u = abs($(sel).attr('content')); if (u) push({ url: u, alt: $('meta[property="og:title"]').attr('content') ?? '', width: null, height: null, near: $('meta[property="og:title"]').attr('content') ?? '', kind: 'og' })
  }
  $('img').each((_, el) => {
    const $el = $(el)
    if ($el.closest('nav, header, footer, aside, [role="navigation"], [class*="nav"], [class*="menu"], [class*="footer"]').length) return
    // srcset: take the largest candidate
    const srcset = ($el.attr('srcset') ?? $el.attr('data-srcset') ?? '').split(',').map(x => x.trim().split(/\s+/)).filter(p => p[0])
    const biggest = srcset.sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0]
    const url = abs(biggest) ?? abs($el.attr('src')) ?? abs($el.attr('data-src')) ?? abs($el.attr('data-lazy-src'))
    if (!url) return
    const alt = ($el.attr('alt') ?? '').trim()
    const w = parseInt($el.attr('width') ?? '') || null, h = parseInt($el.attr('height') ?? '') || null
    if ((w && w < 90) || (h && h < 90)) return
    if (JUNK_IMG.test(url.split('/').pop() ?? '') || JUNK_IMG.test(alt)) return
    const near = [$el.closest('figure').find('figcaption').text(), $el.parent().text(), $el.closest('div, li, article, section').find('h1, h2, h3, h4').first().text()].map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 160)
    push({ url, alt, width: w, height: h, near, kind: 'img' })
  })
  return out.slice(0, max)
}

function pageDate(html: string, metaDate: string | null): string | null {
  if (metaDate) return metaDate.slice(0, 10)
  const $ = cheerio.load(html)
  const c = $('meta[property="article:published_time"]').attr('content') ?? $('meta[name="date"]').attr('content') ?? $('time[datetime]').first().attr('datetime')
  if (c) return c.slice(0, 10)
  const ld = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get().join(' ').match(/"datePublished"\s*:\s*"([^"]+)"/)
  return ld?.[1]?.slice(0, 10) ?? null
}

/** Fetches a page through Firecrawl: main text (markdown) plus the raw HTML for its images. Null if unreachable or not allowed. */
export async function fetchPageRich(url: string, maxText = 7000): Promise<FetchedPage | null> {
  if (!canFetch(url)) return null
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) return null
  try {
    const res = await withSlot(() => fetch('https://api.firecrawl.dev/v1/scrape', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formats: ['markdown', 'rawHtml'], onlyMainContent: false, timeout: 30000 }), signal: AbortSignal.timeout(40_000) }))
    if (!res.ok) return null
    const j = await res.json() as { data?: { markdown?: string; rawHtml?: string; metadata?: { title?: string; publishedTime?: string; ogImage?: string; sourceURL?: string } } }
    const html = j.data?.rawHtml ?? ''
    const markdown = (j.data?.markdown ?? '').replace(/\n{3,}/g, '\n\n').trim()
    if (!markdown && !html) return null
    return { url, title: j.data?.metadata?.title ?? '', markdown: markdown.slice(0, maxText), images: html ? extractPageImages(html, j.data?.metadata?.sourceURL ?? url) : [], date: pageDate(html, j.data?.metadata?.publishedTime ?? null), domain: domainOf(url) }
  } catch { return null }
}
