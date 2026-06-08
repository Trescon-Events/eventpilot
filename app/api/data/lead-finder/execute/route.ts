import { smartdataAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST /api/data/lead-finder/execute
   Executes the ICP search via Apollo.io API.
   Body: { search_id, per_page? }
   Requires APOLLO_API_KEY env var.
*/

const APOLLO_KEY = process.env.APOLLO_API_KEY

interface IcpJson {
  person_titles?:                    string[]
  person_seniorities?:               string[]
  organization_locations?:           string[]
  organization_num_employees_ranges?: string[]
  industries?:                       string[]
  q_keywords?:                       string
  negative_keywords?:                string[]
  company_wishlist?:                 string[]
}

export async function POST(req: NextRequest) {
  if (!APOLLO_KEY) {
    return NextResponse.json({
      error: 'Apollo API key not configured. Add APOLLO_API_KEY to your environment variables.',
      setup_required: true,
    }, { status: 503 })
  }

  const { search_id, per_page = 25, page = 1 } = await req.json().catch(() => ({}))

  if (!search_id) return NextResponse.json({ error: 'search_id required' }, { status: 400 })

  // Get the search record
  const { data: search, error: searchErr } = await smartdataAdmin
    .from('sd_icp_searches')
    .select('*')
    .eq('id', search_id)
    .single()

  if (searchErr || !search) {
    return NextResponse.json({ error: 'Search not found' }, { status: 404 })
  }

  const icp = search.final_icp_json as IcpJson
  if (!icp) {
    return NextResponse.json({ error: 'No ICP JSON found. Complete the conversation first.' }, { status: 400 })
  }

  // Build Apollo People Search payload
  const apolloPayload: Record<string, unknown> = {
    api_key:          APOLLO_KEY,
    page,
    per_page,
    prospected_by_current_team: ['no'],
  }

  if (icp.person_titles?.length)                    apolloPayload.person_titles = icp.person_titles
  if (icp.person_seniorities?.length)               apolloPayload.person_seniorities = icp.person_seniorities
  if (icp.organization_locations?.length)           apolloPayload.person_locations = icp.organization_locations
  if (icp.organization_num_employees_ranges?.length) apolloPayload.organization_num_employees_ranges = icp.organization_num_employees_ranges
  if (icp.industries?.length)                       apolloPayload.organization_industry_tag_ids = icp.industries
  if (icp.q_keywords)                               apolloPayload.q_keywords = icp.q_keywords
  if (icp.company_wishlist?.length)                 apolloPayload.q_organization_name = icp.company_wishlist.join(' OR ')

  // Call Apollo People Search API
  const apolloRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body:    JSON.stringify(apolloPayload),
  })

  if (!apolloRes.ok) {
    const errText = await apolloRes.text()
    await smartdataAdmin.from('sd_icp_searches').update({ status: 'failed' }).eq('id', search_id)
    return NextResponse.json({ error: `Apollo error: ${errText}` }, { status: 500 })
  }

  const apolloData = await apolloRes.json()
  const people = apolloData.people ?? []
  const total  = apolloData.pagination?.total_entries ?? people.length

  // Map Apollo results to our contact format
  const contacts = people.map((p: any) => ({
    linkedin_url:    p.linkedin_url ?? null,
    source_tool:     'lead_finder',
    extraction_id:   search_id,
    property_values: {
      firstName:         p.first_name ?? '',
      lastName:          p.last_name ?? '',
      email:             p.email ?? '',
      title:             p.title ?? '',
      seniority:         p.seniority ?? '',
      contactCity:       p.city ?? '',
      contactState:      p.state ?? '',
      contactCountry:    p.country ?? '',
      personLinkedinUrl: p.linkedin_url ?? '',
      companyName:       p.organization?.name ?? '',
    },
    last_enriched_at: new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  }))

  // Upsert contacts into our database
  let inserted = 0
  let dupes    = 0
  for (const c of contacts) {
    if (c.linkedin_url) {
      const { error: upsertErr } = await smartdataAdmin
        .from('sd_contact_records')
        .upsert(c, { onConflict: 'linkedin_url', ignoreDuplicates: false })
      if (upsertErr) dupes++
      else inserted++
    } else {
      const { error: insertErr } = await smartdataAdmin
        .from('sd_contact_records')
        .insert(c)
      if (!insertErr) inserted++
    }
  }

  // Update search status
  await smartdataAdmin
    .from('sd_icp_searches')
    .update({
      status:        page === 1 ? 'sample_ready' : 'exported',
      results_count: total,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', search_id)

  return NextResponse.json({
    ok:                true,
    total_in_apollo:   total,
    returned_this_page: people.length,
    inserted,
    duplicates:        dupes,
    page,
    has_more:          page * per_page < total,
  })
}
