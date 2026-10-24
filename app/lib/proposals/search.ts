/* Web research helpers for Speaker Proposals: Serper (web / video / image search) and Firecrawl (page text). Server-only.
   LinkedIn pages are never fetched — only their search-result snippets are used (scraping LinkedIn is against its terms). */

export type WebHit = { title: string; link: string; snippet: string; date: string | null }
export type VideoHit = { url: string; title: string; channel: string | null; date: string | null; duration: string | null; thumbnail: string | null; snippet: string | null }
export type ImageHit = { imageUrl: string; pageUrl: string; title: string; source: string | null; width: number | null; height: number | null }

async function serper(kind: 'search' | 'videos' | 'images', q: string, num = 8): Promise<Record<string, unknown>> {
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error('SERPER_API_KEY not configured')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://google.serper.dev/${kind}`, { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, num }), signal: AbortSignal.timeout(20_000) })
      if (res.ok) return await res.json() as Record<string, unknown>
      if (res.status < 500 && res.status !== 429) throw new Error(`Serper ${kind} ${res.status}`)
    } catch (e) { if (attempt === 1) throw e }
    await new Promise(r => setTimeout(r, 800))
  }
  return {}
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function webSearch(q: string, num = 8): Promise<WebHit[]> {
  const j = await serper('search', q, num)
  return ((j.organic as Record<string, unknown>[] | undefined) ?? []).map(x => ({ title: str(x.title) ?? '', link: str(x.link) ?? '', snippet: str(x.snippet) ?? '', date: str(x.date) })).filter(x => x.link)
}

export async function videoSearch(q: string, num = 10): Promise<VideoHit[]> {
  const j = await serper('videos', q, num)
  return ((j.videos as Record<string, unknown>[] | undefined) ?? []).map(x => ({
    url: str(x.link) ?? '', title: str(x.title) ?? '', channel: str(x.channel) ?? str(x.source), date: str(x.date), duration: str(x.duration), thumbnail: str(x.imageUrl), snippet: str(x.snippet),
  })).filter(x => x.url)
}

export async function imageSearch(q: string, num = 8): Promise<ImageHit[]> {
  const j = await serper('images', q, num)
  return ((j.images as Record<string, unknown>[] | undefined) ?? []).map(x => ({
    imageUrl: str(x.imageUrl) ?? '', pageUrl: str(x.link) ?? '', title: str(x.title) ?? '', source: str(x.source),
    width: typeof x.imageWidth === 'number' ? x.imageWidth : null, height: typeof x.imageHeight === 'number' ? x.imageHeight : null,
  })).filter(x => x.imageUrl)
}

const SKIP_HOSTS = /(^|\.)linkedin\.com$|(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)youtube\.com$/i

/** Main text of a web page (markdown, trimmed). Null when the page can't be read or is a site we don't scrape. */
export async function fetchPageText(url: string, max = 6000): Promise<string | null> {
  try {
    const host = new URL(url).hostname
    if (SKIP_HOSTS.test(host)) return null
    const key = process.env.FIRECRAWL_API_KEY
    if (!key) return null
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }), signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const j = await res.json() as { data?: { markdown?: string } }
    const text = (j.data?.markdown ?? '').replace(/\n{3,}/g, '\n\n').trim()
    return text ? text.slice(0, max) : null
  } catch { return null }
}

/** The organisation's own logo URL (Firecrawl "branding" of its website). Null when the site doesn't expose one. */
export async function fetchBranding(domain: string): Promise<string | null> {
  try {
    const key = process.env.FIRECRAWL_API_KEY
    if (!key) return null
    const url = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formats: ['branding'] }), signal: AbortSignal.timeout(35_000) })
    if (!res.ok) return null
    const j = await res.json() as { data?: { branding?: { logo?: string | null; images?: { logo?: string | null } } } }
    const logo = j.data?.branding?.logo ?? j.data?.branding?.images?.logo ?? null
    return logo && (/^https?:\/\//i.test(logo) || logo.startsWith('data:image/svg')) ? logo : null
  } catch { return null }
}
