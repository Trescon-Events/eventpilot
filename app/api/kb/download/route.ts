import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { presignGet, KB_R2_PREFIX } from '@/app/lib/kb/storage'
import { canAccessDocument, LEVEL_RANK } from '@/app/lib/kb/access'

/*
  GET /api/kb/download?document_id=uuid&staff_id=uuid
  Re-checks the same layer/department/min_level access rules as
  /api/documents/list before minting a short-lived presigned R2 URL and
  redirecting — the bucket is private, so a document_id someone happened to
  see is not enough to fetch a file they aren't allowed to access.
  Admins (staff_id omitted, e.g. from the admin panel) skip the check.
*/
export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get('document_id')
  const staffId     = req.nextUrl.searchParams.get('staff_id')
  if (!documentId) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('source_url, layer, department, min_level, is_active, status')
    .eq('id', documentId)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!doc.is_active || doc.status !== 'live') return NextResponse.json({ error: 'Document not available' }, { status: 404 })
  if (!doc.source_url?.startsWith(KB_R2_PREFIX)) return NextResponse.json({ error: 'No original file for this document' }, { status: 404 })

  if (staffId) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('department, job_level')
      .eq('id', staffId)
      .single()

    const staffDept  = (staff?.department ?? '').toLowerCase()
    const staffLevel = LEVEL_RANK[staff?.job_level ?? 'staff'] ?? 0

    if (!canAccessDocument(doc, staffDept, staffLevel)) {
      return NextResponse.json({ error: 'You do not have access to this document' }, { status: 403 })
    }
  }

  const key = doc.source_url.slice(KB_R2_PREFIX.length)
  try {
    const url = await presignGet(key)
    return NextResponse.redirect(url)
  } catch (e) {
    console.error('kb download presign error:', e)
    return NextResponse.json({ error: 'Could not generate a download link. Please try again.' }, { status: 500 })
  }
}
