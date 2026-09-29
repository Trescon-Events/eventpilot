import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { searchIntel } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/intel?q=<title search>&event=<event name text>
   Requires 'news_and_intel'. Not event-id-scoped like the other routes —
   kb_intel_items has no real event_id column, only a free-text
   event_mentioned field (see queries.ts) — the domain gate alone controls
   access here, same as it would for any other public press coverage. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  const event = req.nextUrl.searchParams.get('event')
  const summary = [q && `q=${q}`, event && `event=${event}`].filter(Boolean).join('&') || null
  return handleKnowledgeRequest(req, 'news_and_intel', { querySummary: summary }, () => searchIntel(q, event))
}
