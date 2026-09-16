import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/crm/contacts?search=&limit=&offset= — the global, cross-event
   Contact directory (first genuinely cross-event admin view in the app).
   Search matches email/first_name/last_name. Platform admin only. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const search = req.nextUrl.searchParams.get('search')?.trim()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200)
  const offset = Number(req.nextUrl.searchParams.get('offset')) || 0

  let query = supabaseAdmin
    .from('crm_contacts')
    .select('id, email, first_name, last_name, linkedin_url, company_id, hubspot_contact_id, created_at, crm_companies(id, name, domain)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [], total: count ?? 0 })
}
