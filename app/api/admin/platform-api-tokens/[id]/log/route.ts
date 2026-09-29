import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requirePlatformAdmin } from '@/app/lib/platform-api/admin-access'

/* GET /api/admin/platform-api-tokens/[id]/log?limit=50&offset=0
   Paginated access log for one token — "what was requested," the whole
   reason this token type has a log at all (see auth.ts's top comment). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requirePlatformAdmin(req)
  if (denied) return denied
  const { id } = await params

  const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit')) || 50)
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0)

  const { data, error, count } = await supabaseAdmin
    .from('platform_api_access_log')
    .select('id, requested_at, domain, event_id, query_summary, result_count, status_code, events(name)', { count: 'exact' })
    .eq('token_id', id)
    .order('requested_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [], total: count ?? 0 })
}
