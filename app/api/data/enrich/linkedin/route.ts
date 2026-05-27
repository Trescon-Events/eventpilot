import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST /api/data/enrich/linkedin
   Body: { linkedin_url, user_id }
   Uses Lusha Person API to enrich a LinkedIn profile.
   Requires LUSHA_API_KEY env var.

   Also checks daily credit limit before running.
*/

const LUSHA_KEY = process.env.LUSHA_API_KEY

export async function POST(req: NextRequest) {
  const { linkedin_url, user_id, job_level = 'default' } = await req.json().catch(() => ({}))

  if (!linkedin_url) return NextResponse.json({ error: 'linkedin_url required' }, { status: 400 })

  // Check tool is active
  const { data: tool } = await supabaseAdmin
    .from('sd_tool_status')
    .select('is_active, maintenance_message')
    .eq('tool_key', 'linkedin_enricher')
    .single()

  if (tool && !tool.is_active) {
    return NextResponse.json({ error: tool.maintenance_message ?? 'LinkedIn Enricher is currently disabled.' }, { status: 503 })
  }

  if (!LUSHA_KEY) {
    return NextResponse.json({
      error: 'Lusha API key not configured. Add LUSHA_API_KEY to your environment variables.',
      setup_required: true,
    }, { status: 503 })
  }

  // Check daily credit limit
  if (user_id) {
    const today = new Date().toISOString().split('T')[0]
    const levelKey = ['super_admin', 'office_head'].includes(job_level) ? job_level :
                     job_level === 'dept_head' ? 'dept_head' : 'default'

    const [limitRes, usageRes] = await Promise.all([
      supabaseAdmin.from('sd_lookup_limits').select('daily_limit').eq('job_level', levelKey).single(),
      supabaseAdmin.from('sd_lookup_usage').select('used_count').eq('user_id', user_id).eq('lookup_date', today).single(),
    ])

    const limit    = limitRes.data?.daily_limit ?? 20
    const used     = usageRes.data?.used_count ?? 0

    if (used >= limit) {
      return NextResponse.json({
        error: `Daily limit of ${limit} lookups reached. Resets at midnight.`,
        limit_reached: true,
      }, { status: 429 })
    }
  }

  // Call Lusha Person API
  const lushaRes = await fetch('https://api.lusha.com/person', {
    method:  'POST',
    headers: {
      'api_key':      LUSHA_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ linkedInUrl: linkedin_url }),
  })

  if (!lushaRes.ok) {
    const errText = await lushaRes.text()
    return NextResponse.json({ error: `Lusha error: ${errText}` }, { status: 500 })
  }

  const lusha = await lushaRes.json()

  // Map Lusha response to our property_values schema
  const pv: Record<string, unknown> = {}
  if (lusha.firstName)     pv.firstName   = lusha.firstName
  if (lusha.lastName)      pv.lastName    = lusha.lastName
  if (lusha.position)      pv.title       = lusha.position
  if (lusha.companyName)   pv.companyName = lusha.companyName

  const emails = lusha.emails ?? []
  const phones = lusha.phoneNumbers ?? []
  if (emails[0]?.email)   pv.email        = emails[0].email
  if (phones[0]?.number)  pv.phoneNumber1 = phones[0].number
  if (phones[1]?.number)  pv.phoneNumber2 = phones[1].number

  if (lusha.city)     pv.contactCity    = lusha.city
  if (lusha.state)    pv.contactState   = lusha.state
  if (lusha.country)  pv.contactCountry = lusha.country
  pv.personLinkedinUrl = linkedin_url

  // Company enrichment
  const companyPv: Record<string, unknown> = {}
  if (lusha.companyName)    companyPv.companyName = lusha.companyName
  if (lusha.companyDomain)  companyPv.website     = `https://${lusha.companyDomain}`
  if (lusha.companyCountry) companyPv.companyCountry = lusha.companyCountry
  if (lusha.companyIndustry) companyPv.industry   = lusha.companyIndustry
  if (lusha.companySize)    companyPv.employees   = lusha.companySize

  // Upsert company record
  let companyId: string | null = null
  if (lusha.companyDomain) {
    const { data: co } = await supabaseAdmin
      .from('sd_company_records')
      .upsert({
        domain:          lusha.companyDomain,
        name:            lusha.companyName ?? lusha.companyDomain,
        website:         companyPv.website as string ?? null,
        property_values: companyPv,
        source_tool:     'linkedin_enricher',
        last_enriched_at: new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'domain' })
      .select('id')
      .single()
    companyId = co?.id ?? null
  }

  // Upsert contact record
  const { data: contact, error } = await supabaseAdmin
    .from('sd_contact_records')
    .upsert({
      linkedin_url:     linkedin_url,
      property_values:  pv,
      company_record_id: companyId,
      source_tool:      'linkedin_enricher',
      last_enriched_at: new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'linkedin_url' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Write audit entries
  const auditEntries = Object.entries(pv).map(([key, val]) => ({
    contact_id:  contact.id,
    source_tool: 'linkedin_enricher',
    field_key:   key,
    new_value:   val != null ? String(val) : null,
    action:      'auto_merge',
  }))
  if (auditEntries.length > 0) {
    await supabaseAdmin.from('sd_enrichment_audit').insert(auditEntries)
  }

  // Increment usage counter
  if (user_id) {
    const today = new Date().toISOString().split('T')[0]
    await supabaseAdmin.from('sd_lookup_usage').upsert({
      user_id,
      lookup_date: today,
      used_count:  1,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'user_id,lookup_date' })

    // Try to increment — simpler than select+update
    await supabaseAdmin.rpc('increment_lookup_usage', { p_user_id: user_id, p_date: today }).maybeSingle()
  }

  return NextResponse.json({
    ok:         true,
    contact,
    fields_enriched: Object.keys(pv).length,
  })
}
