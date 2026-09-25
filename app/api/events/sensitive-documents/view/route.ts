import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { downloadSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { evaluateAccessPolicy } from '@/app/lib/access/sensitive-access-policy'
import { renderWatermarkedPage } from '@/app/lib/access/document-watermark'
import { logOpsAccess } from '@/app/lib/ops/audit'

/* GET /api/events/sensitive-documents/view?doc_id=X&page=0

   The ONLY way staff open a Passport / National ID (producers, ops, admins).
   Returns one page as a JPEG with the viewer's name + time + a view id burned
   into it — never the original file, never a storage link.

   Who: needs sae.sensitive_documents.view on the document's event. Holders of
   .manage (producers) can open any current document; view-only holders (ops)
   can open only documents a producer has marked reviewed. Everything else —
   missing, deleted, not-yet-reviewed — gets the same 404, so ids can't be probed.
   Where: subject to the location policy (country / office network) in
   sensitive-access-policy.ts — off by default, "monitor" records what would be
   blocked, "enforce" blocks. How often: at most MAX_VIEWS_PER_HOUR page views
   per person. Every view is written to ops_access_audit BEFORE the image is
   produced (no audit row -> no image), with the view id stamped on the image. */

export const runtime = 'nodejs'
export const maxDuration = 60
const MAX_VIEWS_PER_HOUR = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_AVAILABLE = () => NextResponse.json({ error: 'Document not available.' }, { status: 404 })

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get('doc_id') ?? ''
  const pageRaw = req.nextUrl.searchParams.get('page') ?? '0'
  const page = /^\d{1,2}$/.test(pageRaw) ? Number(pageRaw) : -1
  if (!UUID.test(docId) || page < 0) return NOT_AVAILABLE()

  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: doc } = await supabaseAdmin.from('speaker_sensitive_documents')
    .select('id, event_id, speaker_id, document_type, mime_type, storage_path, reviewed_at, deleted_at')
    .eq('id', docId).maybeSingle()
  if (!doc || doc.deleted_at || !doc.storage_path) return NOT_AVAILABLE()

  const isAdmin = !!session.adm
  const canView = isAdmin || await hasEventPermission(session.sid, doc.event_id, 'sae.sensitive_documents.view')
  if (!canView) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const canManage = isAdmin || await hasEventPermission(session.sid, doc.event_id, 'sae.sensitive_documents.manage')
  if (!canManage && !doc.reviewed_at) return NOT_AVAILABLE()

  // Location policy.
  const policy = evaluateAccessPolicy(req)
  const wouldBlock = policy.mode !== 'off' && !policy.allowed
  if (wouldBlock && policy.mode === 'enforce') {
    await logOpsAccess({ eventId: doc.event_id, actorType: 'staff', actorId: session.sid, action: 'document_view_blocked', targetType: 'sensitive_document', targetId: doc.id, meta: { reason: policy.reason, country: policy.country }, ip: policy.logIp })
    return NextResponse.json({ error: 'Passport and ID documents can only be opened from approved locations (the UAE or a Trescon office network). If you need access from here, please contact the Trescon Ops team.' }, { status: 403 })
  }

  // Volume cap — deters bulk harvesting with a stolen or misused login.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { count: recent } = await supabaseAdmin.from('ops_access_audit').select('*', { count: 'exact', head: true })
    .eq('actor_type', 'staff').eq('actor_id', session.sid).eq('action', 'document_view').gte('created_at', hourAgo)
  if ((recent ?? 0) >= MAX_VIEWS_PER_HOUR) return NextResponse.json({ error: 'Too many document views in the last hour. Please try again later.' }, { status: 429 })

  const { data: staff } = await supabaseAdmin.from('staff_members').select('name').eq('id', session.sid).maybeSingle()
  const viewer = staff?.name ?? 'Admin'
  const viewId = randomBytes(4).toString('hex').toUpperCase()

  const audited = await logOpsAccess({
    eventId: doc.event_id, actorType: 'staff', actorId: session.sid, action: 'document_view', targetType: 'sensitive_document', targetId: doc.id,
    meta: { view_id: viewId, page, speaker_id: doc.speaker_id, document_type: doc.document_type, country: policy.country, policy: policy.mode, would_block: wouldBlock },
    ip: policy.logIp,
  })
  if (!audited) return NextResponse.json({ error: 'Could not record access. Please try again.' }, { status: 500 })

  const bytes = await downloadSensitiveDocument(doc.storage_path)
  if (!bytes) return NextResponse.json({ error: 'This document is no longer available.' }, { status: 410 })

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  let rendered
  try {
    rendered = await renderWatermarkedPage(bytes, doc.mime_type, page, [`${viewer}  ·  ${stamp} UTC`, `Trescon confidential  ·  view ${viewId}`])
  } catch (e) {
    console.error('[sensitive-doc-view] render failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'This document could not be displayed.' }, { status: 500 })
  }
  if (!rendered) return NOT_AVAILABLE()

  return new NextResponse(new Uint8Array(rendered.jpeg), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline; filename="view.jpg"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Page-Count': String(rendered.pageCount),
      'Access-Control-Expose-Headers': 'X-Page-Count',
    },
  })
}
