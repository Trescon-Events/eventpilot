import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/data/companies
   Query params: q, page, limit, country, industry, has_website
   POST /api/data/companies — create company
*/

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q          = searchParams.get('q')?.trim() ?? ''
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit      = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))
  const country    = searchParams.get('country') ?? ''
  const industry   = searchParams.get('industry') ?? ''
  const hasWebsite = searchParams.get('has_website')

  const from = (page - 1) * limit
  const to   = from + limit - 1

  let query = supabaseAdmin
    .from('sd_company_records')
    .select('id, name, domain, website, property_values, last_enriched_at, source_tool, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (q) {
    const escaped = q.replace(/'/g, "''")
    query = query.or(`name.ilike.%${escaped}%,domain.ilike.%${escaped}%,property_values->>industry.ilike.%${escaped}%`)
  }

  if (country) query = query.eq('property_values->>companyCountry', country)
  if (industry) query = query.eq('property_values->>industry', industry)
  if (hasWebsite === 'true') query = query.not('website', 'is', null)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    companies: data ?? [],
    total: count ?? 0,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const { name, domain, website, property_values, source_tool } = await req.json().catch(() => ({}))

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('sd_company_records')
    .insert({
      name,
      domain: domain ?? null,
      website: website ?? null,
      property_values: property_values ?? {},
      source_tool: source_tool ?? 'manual',
      last_enriched_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
