import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { searchDocuments } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/documents?q=<title search>
   Requires 'documents_reports'. Cross-event — respects the token's own
   event scope (all vs specific list), never any event outside it. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  return handleKnowledgeRequest(req, 'documents_reports', { querySummary: q ? `q=${q}` : null }, scope => searchDocuments(scope, q))
}
