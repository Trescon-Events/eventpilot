import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getEventAgenda } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events/[id]/agenda
   Requires 'agenda'. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleKnowledgeRequest(req, 'agenda', { eventId: id }, () => getEventAgenda(id))
}
