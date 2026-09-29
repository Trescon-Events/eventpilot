import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getEventDocuments } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/events/[id]/documents
   Requires 'documents_reports'. Returns { files, reference_docs } — files
   are docuhub_documents (post-event reports, BD proposals; never HR
   policy, see queries.ts's ALLOWED_DOC_TYPE_KEYS), reference_docs is the
   event's live style guide/messaging document/production pack via the
   Content Guidelines compiler. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleKnowledgeRequest(req, 'documents_reports', { eventId: id }, () => getEventDocuments(id))
}
