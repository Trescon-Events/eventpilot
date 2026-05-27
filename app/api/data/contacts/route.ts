import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/data/contacts
   Query params:
   - q         : text search (name, email, title, company)
   - page      : page number (default 1)
   - limit     : per page (default 25, max 100)
   - country   : filter by contactCountry
   - seniority : filter by seniority level
   - source    : filter by source_tool
   - target    : event target field (vendorTarget|delegateTarget|speakerTarget|etc)
   - event     : event name within the target array
   - has_email : true/false
   - has_phone : true/false

   POST /api/data/contacts — create a single contact
*/

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q         = searchParams.get('q')?.trim() ?? ''
  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25')))
  const country   = searchParams.get('country') ?? ''
  const seniority = searchParams.get('seniority') ?? ''
  const source    = searchParams.get('source') ?? ''
  const target    = searchParams.get('target') ?? ''
  const event     = searchParams.get('event') ?? ''
  const hasEmail  = searchParams.get('has_email')
  const hasPhone  = searchParams.get('has_phone')

  const from = (page - 1) * limit
  const to   = from + limit - 1

  let query = supabaseAdmin
    .from('sd_contact_records')
    .select(`
      id,
      linkedin_url,
      property_values,
      company_record_id,
      last_enriched_at,
      source_tool,
      created_at,
      sd_company_records(name, domain, property_values)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  // Text search across key fields
  if (q) {
    const escaped = q.replace(/'/g, "''")
    query = query.or(
      `property_values->>firstName.ilike.%${escaped}%,` +
      `property_values->>lastName.ilike.%${escaped}%,` +
      `property_values->>email.ilike.%${escaped}%,` +
      `property_values->>title.ilike.%${escaped}%,` +
      `property_values->>companyName.ilike.%${escaped}%`
    )
  }

  // Country filter
  if (country) {
    query = query.eq('property_values->>contactCountry', country)
  }

  // Seniority filter
  if (seniority) {
    query = query.eq('property_values->>seniority', seniority)
  }

  // Source tool filter
  if (source) {
    query = query.eq('source_tool', source)
  }

  // Email presence
  if (hasEmail === 'true') {
    query = query.not('property_values->>email', 'is', null)
  } else if (hasEmail === 'false') {
    query = query.is('property_values->>email', null)
  }

  // Phone presence
  if (hasPhone === 'true') {
    query = query.not('property_values->>phoneNumber1', 'is', null)
  }

  // Event target filter (e.g. vendorTarget contains "DFS")
  if (target && event) {
    query = (query as any).contains(`property_values->${target}`, JSON.stringify([event]))
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    contacts: data ?? [],
    total: count ?? 0,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { property_values, linkedin_url, company_record_id, source_tool } = body

  if (!property_values || typeof property_values !== 'object') {
    return NextResponse.json({ error: 'property_values required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('sd_contact_records')
    .insert({
      property_values,
      linkedin_url: linkedin_url ?? null,
      company_record_id: company_record_id ?? null,
      source_tool: source_tool ?? 'manual',
      last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
