import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { urls } = await req.json()

    /* ── Check for Firecrawl API key ── */
    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error:          'FIRECRAWL_API_KEY not configured',
        setup_required: true,
        message:        'Add FIRECRAWL_API_KEY to your .env.local to enable URL scraping. Get your key at firecrawl.dev',
      })
    }

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array is required' }, { status: 400 })
    }

    const results: { url: string; companies: { name?: string; website?: string }[]; error?: string }[] = []

    for (const url of urls) {
      try {
        const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        })

        const scrapeData = await scrapeRes.json()
        if (!scrapeRes.ok || scrapeData.error) {
          results.push({ url, companies: [], error: scrapeData.error ?? `HTTP ${scrapeRes.status}` })
          continue
        }

        const markdown = scrapeData.data?.markdown ?? scrapeData.markdown ?? ''

        // Use Gemini to extract companies from the markdown if available
        const geminiKey = process.env.GEMINI_API_KEY
        if (geminiKey && markdown) {
          const gemRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `From this page content, extract all company/organisation names and their websites. Return a JSON array only: [{"name": "...", "website": "..."}]. If no website found, omit website field. Page content:\n\n${markdown.slice(0, 8000)}`,
                  }],
                }],
              }),
            }
          )
          const gd     = await gemRes.json()
          const text   = gd?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          const match  = text.match(/\[[\s\S]*?\]/)
          if (match) {
            try {
              const parsed = JSON.parse(match[0])
              results.push({ url, companies: parsed })
              continue
            } catch { /* fall through to basic extraction */ }
          }
        }

        // Basic extraction from markdown
        const URL_RE   = /https?:\/\/[^\s,;"'<>()[\]{}]+/g
        const urls_found = markdown.match(URL_RE) ?? []
        const companies = urls_found.slice(0, 50).map((u: string) => {
          try {
            const hostname = new URL(u).hostname.replace(/^www\./, '')
            return { name: hostname, website: u }
          } catch {
            return { website: u }
          }
        })
        results.push({ url, companies })
      } catch (e: any) {
        results.push({ url, companies: [], error: e.message })
      }
    }

    return NextResponse.json({ results, count: results.reduce((a, r) => a + r.companies.length, 0) })
  } catch (e: any) {
    console.error('[extract/url]', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
