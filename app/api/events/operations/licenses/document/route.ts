import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getSensitiveDocumentSignedUrl } from '@/app/lib/events/sensitive-storage'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* GET /api/events/operations/licenses/document?doc_id=X
   Preview link for one Passport/National ID, for the ops verification
   modal. Requires BOTH ops.licenses.view and sae.sensitive_documents.view
   on the document's event (ops needs the same document access a producer
   has — granted to named individuals only). Only documents a producer has
   marked reviewed and that haven't been deleted are reachable. Every
   request is written to ops_access_audit BEFORE the link is returned. */
export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get('doc_id')
  if (!docId) return NextResponse.json({ error: 'doc_id required' }, { status: 400 })

  const { data: doc } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .select('id, event_id, speaker_id, document_type, file_name, mime_type, storage_path, reviewed_at, deleted_at')
    .eq('id', docId).maybeSingle()
  // Same response for missing / not-yet-reviewed / deleted, so this can't
  // be used to probe which document IDs exist.
  if (!doc || doc.deleted_at || !doc.reviewed_at || !doc.storage_path) {
    return NextResponse.json({ error: 'Document not available.' }, { status: 404 })
  }

  const session = getSession(req)
  const allowed = !!session?.adm || (
    (await hasEventPermission(session?.sid, doc.event_id, 'ops.licenses.view')) &&
    (await hasEventPermission(session?.sid, doc.event_id, 'sae.sensitive_documents.view'))
  )
  if (!allowed) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const audited = await logOpsAccess({
    eventId: doc.event_id, actorType: 'staff', actorId: session?.sid ?? null, action: 'document_preview',
    targetType: 'sensitive_document', targetId: doc.id, meta: { speaker_id: doc.speaker_id, document_type: doc.document_type }, ip: clientIp(req),
  })
  // Sensitive access without an audit record isn't acceptable.
  if (!audited) return NextResponse.json({ error: 'Could not record access. Please try again.' }, { status: 500 })

  const url = await getSensitiveDocumentSignedUrl(doc.storage_path)
  if (!url) return NextResponse.json({ error: 'Could not open the document.' }, { status: 500 })
  return NextResponse.json({ url, file_name: doc.file_name, mime_type: doc.mime_type, document_type: doc.document_type }, { headers: { 'Cache-Control': 'no-store' } })
}
