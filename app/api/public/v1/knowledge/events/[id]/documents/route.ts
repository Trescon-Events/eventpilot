import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getEventDocuments } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events/[id]/documents
   Requires 'documents_reports'. Public documents only (docuhub
   visibility='public') — see queries.ts's own comment on why that one
   column is the whole HR-policy/BD-proposal exclusion rule. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleKnowledgeRequest(req, 'documents_reports', { eventId: id }, () => getEventDocuments(id))
}
