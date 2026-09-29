import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getEventOverview } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events/[id]
   Requires 'event_overview'. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleKnowledgeRequest(req, 'event_overview', { eventId: id }, () => getEventOverview(id))
}
