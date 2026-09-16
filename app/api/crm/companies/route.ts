import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/crm/companies?search=&limit=&offset() — the global, cross-event
   Company directory. Search matches name/domain. Platform admin only. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const search = req.nextUrl.searchParams.get('search')?.trim()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200)
  const offset = Number(req.nextUrl.searchParams.get('offset')) || 0

  let query = supabaseAdmin
    .from('crm_companies')
    .select('id, name, domain, website, hubspot_company_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [], total: count ?? 0 })
}
