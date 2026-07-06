import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

export const maxDuration = 300

/*
  POST /api/kb/intel/run
  Auth: Authorization: Bearer <KB_INTEL_CRON_SECRET>  (cron-job.org, weekly)
     OR { admin_staff_id } belonging to a kb_admin / super_admin  ("Run Now" button)

  Discovers candidate article URLs per active kb_intel_source (Serper for
  search_query, Firecrawl crawl for direct_url, Firecrawl scrape + Gemini
  extraction for event_registry), scores each new URL with Gemini, and either
  auto-publishes (score >= auto_publish_threshold), queues for review
  (score >= review_threshold), or skips it. See docs/EventPilot-KB-PRD-v2.0.md
  section 5 for the full spec this implements.
*/

const SERPER_URL         = 'https://google.serper.dev/search'
const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v1/scrape'
const FIRECRAWL_CRAWL_URL  = 'https://api.firecrawl.dev/v1/crawl'

const SOURCE_CATEGORY_TO_DOC_CATEGORY: Record<string, string> = {
  owned_property: 'external_owned',
  partner_govt:   'external_partner',
  press_media:    'external_press',
}

const ARTICLE_TYPES = ['press_release', 'media_coverage', 'government', 'event_website', 'other']

async function callSerper(query: string): Promise<{ url: string; title: string | null }[]> {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 10 }),
  })
  if (!res.ok) throw new Error(`Serper error ${res.status}`)
  const data = await res.json()
  return (data.organic ?? [])
    .map((r: { link?: string; title?: string }) => ({ url: r.link ?? '', title: r.title ?? null }))
    .filter((r: { url: string }) => r.url)
}

async function firecrawlScrape(url: string): Promise<{ markdown: string; title: string | null; publishedDate: string | null }> {
  const res = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  })
  if (!res.ok) throw new Error(`Firecrawl scrape error ${res.status}`)
  const data = await res.json()
  return {
    markdown:      data.data?.markdown ?? '',
    title:         data.data?.metadata?.title ?? null,
    publishedDate: data.data?.metadata?.publishedDate ?? data.data?.metadata?.publishedTime ?? null,
  }
}

// Firecrawl's crawl endpoint is asynchronous — kick it off, then poll until
// it completes (or times out) and collect the URLs of the pages it found.
async function firecrawlDiscoverUrls(url: string, limit: number): Promise<string[]> {
  const startRes = await fetch(FIRECRAWL_CRAWL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, limit, scrapeOptions: { formats: ['links'] } }),
  })
  if (!startRes.ok) throw new Error(`Firecrawl crawl error ${startRes.status}`)
  const { id } = await startRes.json()
  if (!id) return []

  const statusUrl = `${FIRECRAWL_CRAWL_URL}/${id}`
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    const pollRes = await fetch(statusUrl, { headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` } })
    if (!pollRes.ok) throw new Error(`Firecrawl crawl status error ${pollRes.status}`)
    const poll = await pollRes.json()

    if (poll.status === 'completed') {
      const urls = (poll.data ?? [])
        .map((p: { metadata?: { sourceURL?: string }; url?: string }) => p.metadata?.sourceURL ?? p.url)
        .filter(Boolean) as string[]
      return [...new Set(urls)]
    }
    if (poll.status === 'failed') throw new Error('Firecrawl crawl failed')
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('Firecrawl crawl timed out')
}

async function scoreArticle(genAI: GoogleGenerativeAI, title: string, markdown: string, eventContext: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
  const prompt = `Score this article 0-100 for relevance to Trescon Global Events.
Trescon is a UAE-based event management company.
${eventContext}

Return ONLY valid JSON, no markdown:
{"score": number, "reasoning": "max 2 sentences", "event_mentioned": string or null, "article_type": "press_release|media_coverage|government|event_website|other"}

Article title: ${title}
Article content (first 2000 chars): ${markdown.slice(0, 2000)}`

  const result = await model.generateContent(prompt)
  const parsed = JSON.parse(result.response.text())
  return {
    score:           Math.min(100, Math.max(0, Number(parsed.score ?? 0))),
    reasoning:       String(parsed.reasoning ?? '').slice(0, 500),
    event_mentioned: parsed.event_mentioned || null,
    article_type:    ARTICLE_TYPES.includes(parsed.article_type) ? parsed.article_type : 'other',
  }
}

async function generateSummary(genAI: GoogleGenerativeAI, processorGuide: string, title: string, url: string, markdown: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const prompt = `You are processing a web article for Trescon's EventPilot Knowledge Base.

PROCESSOR GUIDE (follow the "Media article" schema exactly — this is a third-party or owned-property web article, not an uploaded file):
${processorGuide}

ARTICLE URL: ${url}
ARTICLE TITLE: ${title}

ARTICLE CONTENT:
${markdown.slice(0, 20000)}

Generate a structured .md summary following the Media article output schema in the processor guide above.
Output ONLY the markdown content — no preamble, no explanation, no code fences.
Start directly with the YAML front matter (---).`

  const result = await model.generateContent(prompt)
  return result.response.text().trim().replace(/^```(?:markdown)?\n([\s\S]*?)\n```$/, '$1').trim()
}

async function extractEventRegistry(genAI: GoogleGenerativeAI, markdown: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
  const prompt = `Extract the list of events from this Trescon events page content. Return ONLY a JSON array, no markdown:
[{"name": string, "status": string, "website": string or null, "description": string}]

PAGE CONTENT:
${markdown.slice(0, 15000)}`

  const result = await model.generateContent(prompt)
  const parsed = JSON.parse(result.response.text())
  return Array.isArray(parsed) ? parsed : []
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const body = await req.json().catch(() => ({}))

  const isCron = !!process.env.KB_INTEL_CRON_SECRET && authHeader === `Bearer ${process.env.KB_INTEL_CRON_SECRET}`
  if (!isCron && !(await isKbAdmin(body?.admin_staff_id))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }
  const triggeredBy = isCron ? 'scheduler' : 'manual'

  const { data: run, error: runErr } = await supabaseAdmin
    .from('kb_intel_runs')
    .insert({ status: 'running', triggered_by: triggeredBy })
    .select('id')
    .single()
  if (runErr || !run) return NextResponse.json({ error: 'Could not start run.' }, { status: 500 })

  const { data: config } = await supabaseAdmin.from('kb_intel_config').select('*').limit(1).single()
  if (!config) {
    await supabaseAdmin.from('kb_intel_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'kb_intel_config row missing — run the migration first.' }).eq('id', run.id)
    return NextResponse.json({ error: 'kb_intel_config row missing — run the migration first.' }, { status: 500 })
  }

  const autoPublishThreshold = config.auto_publish_threshold ?? 75
  const reviewThreshold      = config.review_threshold ?? 40
  let eventRegistryData: { name: string }[] = config.event_registry_data ?? []

  const { data: sources } = await supabaseAdmin.from('kb_intel_sources').select('*').eq('is_active', true)

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const processorGuide = readFileSync(join(process.cwd(), 'knowledge-engine', 'processors', 'corporate-doc.md'), 'utf-8')

  let sourcesChecked = 0
  let sourcesFailed = 0
  let urlsDiscovered = 0
  let itemsAutoPublished = 0
  let itemsQueued = 0
  let itemsSkipped = 0
  const errors: string[] = []

  for (const source of sources ?? []) {
    try {
      if (source.source_type === 'event_registry') {
        const { markdown } = await firecrawlScrape(source.config.url)
        const events = await extractEventRegistry(genAI, markdown)
        eventRegistryData = events
        await supabaseAdmin.from('kb_intel_config').update({
          event_registry_data: events,
          event_registry_last_updated: new Date().toISOString(),
        }).eq('id', config.id)
        await supabaseAdmin.from('kb_intel_sources').update({
          last_run_at: new Date().toISOString(), last_found_count: events.length,
        }).eq('id', source.id)
        sourcesChecked++
        continue
      }

      let discovered: { url: string; title?: string | null }[] = []
      if (source.source_type === 'search_query') {
        discovered = await callSerper(source.config.query)
      } else if (source.source_type === 'direct_url') {
        const urls = await firecrawlDiscoverUrls(source.config.url, 20)
        discovered = urls.map(u => ({ url: u }))
      }
      urlsDiscovered += discovered.length

      const candidateUrls = discovered.map(d => d.url)
      const { data: existingItems } = candidateUrls.length
        ? await supabaseAdmin.from('kb_intel_items').select('url').in('url', candidateUrls)
        : { data: [] }
      const existingUrls = new Set((existingItems ?? []).map(i => i.url))
      const newUrls = discovered.filter(d => !existingUrls.has(d.url))

      const eventContext = eventRegistryData.length
        ? `Current Trescon events: ${eventRegistryData.map(e => e.name).join(', ')}`
        : 'No current event list available.'

      for (const candidate of newUrls) {
        try {
          const { markdown, title, publishedDate } = await firecrawlScrape(candidate.url)
          const effectiveTitle = candidate.title ?? title ?? candidate.url
          const scored = await scoreArticle(genAI, effectiveTitle, markdown, eventContext)

          if (scored.score >= autoPublishThreshold) {
            const summary = await generateSummary(genAI, processorGuide, effectiveTitle, candidate.url, markdown)
            const docCategory = SOURCE_CATEGORY_TO_DOC_CATEGORY[source.category] ?? 'external_press'
            const docId = randomUUID()

            const { data: doc } = await supabaseAdmin.from('documents').insert({
              id: docId, document_group_id: docId, version: 1,
              title: effectiveTitle, type: 'external_intel', extracted_text: summary,
              word_count: summary.split(/\s+/).filter(Boolean).length,
              visibility: 'all', layer: 'knowledge_base', department: 'all', min_level: 'all',
              pilot_use: true, doc_category: docCategory, status: 'live', is_active: true,
              source_url: candidate.url,
              ai_reasoning: `Auto-published by Press Intelligence pipeline (score ${scored.score}). ${scored.reasoning}`,
              confidence: scored.score, flagged: false,
            }).select('id').single()

            await supabaseAdmin.from('kb_intel_items').insert({
              source_id: source.id, url: candidate.url, title: effectiveTitle,
              published_date: publishedDate, raw_content: markdown.slice(0, 20000),
              gemini_score: scored.score, gemini_reasoning: scored.reasoning, gemini_summary: summary,
              event_mentioned: scored.event_mentioned, article_type: scored.article_type,
              status: 'auto_published', document_id: doc?.id ?? null, run_id: run.id,
            })
            itemsAutoPublished++
          } else if (scored.score >= reviewThreshold) {
            const summary = await generateSummary(genAI, processorGuide, effectiveTitle, candidate.url, markdown)
            await supabaseAdmin.from('kb_intel_items').insert({
              source_id: source.id, url: candidate.url, title: effectiveTitle,
              published_date: publishedDate, raw_content: markdown.slice(0, 20000),
              gemini_score: scored.score, gemini_reasoning: scored.reasoning, gemini_summary: summary,
              event_mentioned: scored.event_mentioned, article_type: scored.article_type,
              status: 'pending', run_id: run.id,
            })
            itemsQueued++
          } else {
            await supabaseAdmin.from('kb_intel_items').insert({
              source_id: source.id, url: candidate.url, title: effectiveTitle,
              published_date: publishedDate, raw_content: null,
              gemini_score: scored.score, gemini_reasoning: scored.reasoning,
              event_mentioned: scored.event_mentioned, article_type: scored.article_type,
              status: 'skipped', run_id: run.id,
            })
            itemsSkipped++
          }
        } catch (articleErr) {
          errors.push(`${candidate.url}: ${articleErr instanceof Error ? articleErr.message : String(articleErr)}`)
        }
      }

      await supabaseAdmin.from('kb_intel_sources').update({
        last_run_at: new Date().toISOString(), last_found_count: newUrls.length,
      }).eq('id', source.id)
      sourcesChecked++
    } catch (sourceErr) {
      sourcesFailed++
      errors.push(`Source "${source.name}": ${sourceErr instanceof Error ? sourceErr.message : String(sourceErr)}`)
    }
  }

  const allFailed = (sources?.length ?? 0) > 0 && sourcesFailed === sources!.length
  await supabaseAdmin.from('kb_intel_runs').update({
    status: allFailed ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    sources_checked: sourcesChecked,
    urls_discovered: urlsDiscovered,
    items_auto_published: itemsAutoPublished,
    items_queued: itemsQueued,
    items_skipped: itemsSkipped,
    error_message: errors.length ? errors.slice(0, 20).join(' | ').slice(0, 4000) : null,
  }).eq('id', run.id)

  if (itemsAutoPublished > 0 || itemsQueued > 0) {
    const { data: kbAdmins } = await supabaseAdmin.from('staff_members').select('id').contains('access_roles', ['kb_admin'])
    if (kbAdmins?.length) {
      await supabaseAdmin.from('notifications').insert(kbAdmins.map(s => ({
        staff_id: s.id, type: 'kb_intel_run', course_id: null, read: false,
        title: 'Intelligence run complete',
        body: `${itemsAutoPublished} auto-published, ${itemsQueued} need your review.`,
      })))
    }
  }

  return NextResponse.json({
    success: true, run_id: run.id,
    sources_checked: sourcesChecked, urls_discovered: urlsDiscovered,
    items_auto_published: itemsAutoPublished, items_queued: itemsQueued, items_skipped: itemsSkipped,
    errors,
  })
}
