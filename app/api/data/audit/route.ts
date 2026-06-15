import { smartdataAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/data/audit?contact_id=&tool=&limit=100 */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const contactId = searchParams.get('contact_id')
  const tool      = searchParams.get('tool')
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)

  let query = smartdataAdmin
    .from('sd_enrichment_audit')
    .select(`
      id, contact_id, company_id, source_tool, field_key,
      old_value, new_value, action, performed_by, created_at,
      sd_contact_records(property_values)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (contactId) query = query.eq('contact_id', contactId)
  if (tool)      query = query.eq('source_tool', tool)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach readable contact name
  const rows = (data ?? []).map((r: any) => {
    const pv   = r.sd_contact_records?.property_values ?? {}
    const name = [pv.firstName, pv.lastName].filter(Boolean).join(' ') || pv.email?.split('@')[0] || null
    const { sd_contact_records: _, ...rest } = r
    return { ...rest, contact_name: name }
  })

  return NextResponse.json(rows)
}
