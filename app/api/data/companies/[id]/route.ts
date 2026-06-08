import { smartdataAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET    /api/data/companies/[id]  — company detail + linked contacts
   PATCH  /api/data/companies/[id]  — update property_values (merge)
   DELETE /api/data/companies/[id]  — delete company
*/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [companyRes, contactsRes] = await Promise.all([
    smartdataAdmin
      .from('sd_company_records')
      .select('*')
      .eq('id', id)
      .single(),
    smartdataAdmin
      .from('sd_contact_records')
      .select('id, linkedin_url, property_values, source_tool, last_enriched_at, created_at')
      .eq('company_record_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (companyRes.error || !companyRes.data) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  return NextResponse.json({
    company:  companyRes.data,
    contacts: contactsRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { property_values, name, domain, website } = await req.json().catch(() => ({}))

  // Get current values for merge
  const { data: current } = await smartdataAdmin
    .from('sd_company_records')
    .select('property_values')
    .eq('id', id)
    .single()

  const merged = { ...(current?.property_values ?? {}), ...(property_values ?? {}) }

  const update: Record<string, any> = {
    property_values: merged,
    last_enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (name)   update.name   = name
  if (domain) update.domain = domain
  if (website) update.website = website

  const { data, error } = await smartdataAdmin
    .from('sd_company_records')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await smartdataAdmin
    .from('sd_company_records')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
