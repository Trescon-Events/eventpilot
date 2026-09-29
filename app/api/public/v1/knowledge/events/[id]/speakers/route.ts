import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getEventSpeakers } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events/[id]/speakers
   Requires 'speakers_partners'. Public, approved speaker profiles only —
   same field allowlist and approval bar as the live public website. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleKnowledgeRequest(req, 'speakers_partners', { eventId: id }, () => getEventSpeakers(id))
}
