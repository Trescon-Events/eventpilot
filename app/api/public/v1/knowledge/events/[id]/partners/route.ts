import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getEventPartners } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events/[id]/partners
   Requires 'speakers_partners'. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleKnowledgeRequest(req, 'speakers_partners', { eventId: id }, () => getEventPartners(id))
}
