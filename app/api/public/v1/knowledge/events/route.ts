import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { listAccessibleEvents } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events
   Authorization: Bearer ep_ai_<token>
   Lists events this token can see — every event if the token's
   event_scope is 'all', otherwise only its own event_ids list.
   Requires the 'event_overview' domain. */
export async function GET(req: NextRequest) {
  return handleKnowledgeRequest(req, 'event_overview', {}, scope => listAccessibleEvents(scope))
}
