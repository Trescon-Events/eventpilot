import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/crm/companies/[id] — detail panel: the company, its linked
   contacts, and every event+role it's linked to (crm_company_event_links). */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const { data: company, error } = await supabaseAdmin.from('crm_companies').select('*').eq('id', id).single()
  if (error || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const [{ data: links }, { data: contacts }] = await Promise.all([
    supabaseAdmin
      .from('crm_company_event_links')
      .select('id, role, created_at, events(id, name, city, event_date)')
      .eq('company_id', id)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('crm_contacts').select('id, email, first_name, last_name').eq('company_id', id),
  ])

  return NextResponse.json({ ...company, event_links: links ?? [], contacts: contacts ?? [] })
}
