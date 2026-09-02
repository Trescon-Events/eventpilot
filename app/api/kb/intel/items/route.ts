import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

/*
  GET /api/kb/intel/items
  Params: ?status=pending&source_id=x&run_id=y&limit=20&offset=0&search=text
*/
export async function GET(req: NextRequest) {
  if (!(await isKbAdmin(getSessionStaffId(req)))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const status    = req.nextUrl.searchParams.get('status')
  const sourceId  = req.nextUrl.searchParams.get('source_id')
  const runId     = req.nextUrl.searchParams.get('run_id')
  const search    = req.nextUrl.searchParams.get('search')
  const limit     = Number(req.nextUrl.searchParams.get('limit') ?? 20)
  const offset    = Number(req.nextUrl.searchParams.get('offset') ?? 0)

  let query = supabaseAdmin
    .from('kb_intel_items')
    .select('*, kb_intel_sources(name, category)', { count: 'exact' })
    .order('discovered_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)   query = query.eq('status', status)
  if (sourceId) query = query.eq('source_id', sourceId)
  if (runId)    query = query.eq('run_id', runId)
  if (search)   query = query.or(`title.ilike.%${search}%,url.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [], total: count ?? 0 })
}
