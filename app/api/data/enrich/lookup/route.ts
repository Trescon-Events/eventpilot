import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST /api/data/enrich/lookup
   Smart Lookup — quick person lookup by LinkedIn URL or name+company.
   Uses Lusha Person API (same key as linkedin_enricher, but lighter query).
   Body: { linkedin_url?, first_name?, last_name?, company_name?, user_id }
*/

const LUSHA_KEY = process.env.LUSHA_API_KEY

export async function POST(req: NextRequest) {
  const { linkedin_url, first_name, last_name, company_name, user_id, job_level = 'default' } =
    await req.json().catch(() => ({}))

  if (!linkedin_url && !(first_name && last_name)) {
    return NextResponse.json({ error: 'Provide linkedin_url or first_name + last_name' }, { status: 400 })
  }

  if (!LUSHA_KEY) {
    return NextResponse.json({
      error: 'Lusha API key not configured. Add LUSHA_API_KEY to your environment variables.',
      setup_required: true,
    }, { status: 503 })
  }

  // Credit check
  if (user_id) {
    const today    = new Date().toISOString().split('T')[0]
    const levelKey = ['super_admin', 'office_head'].includes(job_level) ? job_level :
                     job_level === 'dept_head' ? 'dept_head' : 'default'

    const [limitRes, usageRes] = await Promise.all([
      supabaseAdmin.from('sd_lookup_limits').select('daily_limit').eq('job_level', levelKey).single(),
      supabaseAdmin.from('sd_lookup_usage').select('used_count').eq('user_id', user_id).eq('lookup_date', today).single(),
    ])

    const limit = limitRes.data?.daily_limit ?? 20
    const used  = usageRes.data?.used_count ?? 0

    if (used >= limit) {
      return NextResponse.json({
        error: `Daily lookup limit of ${limit} reached. Resets at midnight.`,
        limit_reached: true,
        used,
        limit,
      }, { status: 429 })
    }
  }

  // Build Lusha payload
  const payload: Record<string, string> = {}
  if (linkedin_url) payload.linkedInUrl = linkedin_url
  if (first_name)   payload.firstName   = first_name
  if (last_name)    payload.lastName    = last_name
  if (company_name) payload.company     = company_name

  const lushaRes = await fetch('https://api.lusha.com/person', {
    method:  'POST',
    headers: { 'api_key': LUSHA_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  if (!lushaRes.ok) {
    return NextResponse.json({ error: `Lusha error: ${lushaRes.status}` }, { status: 500 })
  }

  const data = await lushaRes.json()

  // Increment usage
  if (user_id) {
    const today = new Date().toISOString().split('T')[0]
    await supabaseAdmin.from('sd_lookup_usage').upsert({
      user_id,
      lookup_date: today,
      used_count:  1,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'user_id,lookup_date' })
  }

  return NextResponse.json({
    found:       data.firstName ? true : false,
    first_name:  data.firstName,
    last_name:   data.lastName,
    title:       data.position,
    company:     data.companyName,
    email:       data.emails?.[0]?.email,
    phone:       data.phoneNumbers?.[0]?.number,
    linkedin_url: linkedin_url ?? data.linkedInUrl,
    city:        data.city,
    country:     data.country,
    raw:         data,
  })
}
