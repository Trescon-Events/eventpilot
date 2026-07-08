import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/* GET /api/docuhub/audit — dochub_admin only. Params: ?document_id=&limit=&offset= */
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const documentId = req.nextUrl.searchParams.get('document_id')
  const limit  = Number(req.nextUrl.searchParams.get('limit') ?? 50)
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0)

  let query = supabaseAdmin
    .from('docuhub_audit_log')
    .select('*, staff_members(name, email), docuhub_documents(title)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (documentId) query = query.eq('document_id', documentId)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [], total: count ?? 0 })
}
