import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/*
  POST /api/data/migrate
  Pulls contacts + companies from old Lovable SmartData (SOURCE) and imports
  into the new dedicated SmartData Supabase project (TARGET).

  Body:
  {
    source:       'smartdata'                 // only source supported right now
    entity:       'contacts' | 'companies' | 'both'
    batch_size?:  number (default 500)
    offset?:      number (default 0, for resuming)
    dry_run?:     boolean — count only, no writes
  }

  Returns:
  { fetched, inserted, duplicates, skipped, next_offset, done }

  SOURCE  (old Lovable hgrkmzlynjztzjudsfgd): LOVABLE_SD_URL + LOVABLE_SD_ANON_KEY
           NOTE: old Lovable uses table names WITHOUT sd_ prefix: contact_records, company_records
           RLS blocks anon reads — migration requires the Lovable service_role key (currently unavailable)
  TARGET  (new dedicated lnhtmppybqeicedgtanf): SMARTDATA_URL + SMARTDATA_SERVICE_ROLE_KEY
*/

const LOVABLE_SD_URL  = process.env.LOVABLE_SD_URL ?? 'https://hgrkmzlynjztzjudsfgd.supabase.co'
const LOVABLE_SD_ANON = process.env.LOVABLE_SD_ANON_KEY ?? ''

function lovableSmartdataClient() {
  if (!LOVABLE_SD_ANON) throw new Error('LOVABLE_SD_ANON_KEY not set in .env.local')
  return createClient(LOVABLE_SD_URL, LOVABLE_SD_ANON)
}

function migrateTargetClient() {
  const url = process.env.SMARTDATA_URL
  const key = process.env.SMARTDATA_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SMARTDATA_URL / SMARTDATA_SERVICE_ROLE_KEY not set in .env.local')
  return createClient(url, key)
}

async function migrateCompanies(sd: ReturnType<typeof createClient<any>>, target: ReturnType<typeof createClient<any>>, batchSize: number, offset: number, dryRun: boolean) {
  // Old Lovable table name is company_records (no sd_ prefix)
  const { data, error, count } = await sd
    .from('company_records')
    .select('*', { count: 'exact' })
    .range(offset, offset + batchSize - 1)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`SmartData fetch error: ${error.message}`)
  if (!data || data.length === 0) return { fetched: 0, inserted: 0, duplicates: 0, skipped: 0, total: count ?? 0 }

  if (dryRun) return { fetched: data.length, inserted: 0, duplicates: 0, skipped: 0, total: count ?? 0 }

  const rows = data.map((c: any) => ({
    domain:           c.domain ?? null,
    name:             c.name ?? 'Unknown',
    website:          c.website ?? null,
    property_values:  c.property_values ?? {},
    last_enriched_at: c.last_enriched_at ?? null,
    source_tool:      c.source_tool ?? 'smartdata_import',
    created_at:       c.created_at,
    updated_at:       c.updated_at ?? c.created_at,
  }))

  const { error: insertError } = await target
    .from('sd_company_records')
    .upsert(rows, { onConflict: 'domain', ignoreDuplicates: true })

  if (insertError) throw new Error(`Target insert error: ${insertError.message}`)

  return { fetched: data.length, inserted: data.length, duplicates: 0, skipped: 0, total: count ?? 0 }
}

async function migrateContacts(sd: ReturnType<typeof createClient<any>>, target: ReturnType<typeof createClient<any>>, batchSize: number, offset: number, dryRun: boolean) {
  // Old Lovable table name is contact_records (no sd_ prefix)
  const { data, error, count } = await sd
    .from('contact_records')
    .select('*', { count: 'exact' })
    .range(offset, offset + batchSize - 1)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`SmartData fetch error: ${error.message}`)
  if (!data || data.length === 0) return { fetched: 0, inserted: 0, duplicates: 0, skipped: 0, total: count ?? 0 }

  if (dryRun) return { fetched: data.length, inserted: 0, duplicates: 0, skipped: 0, total: count ?? 0 }

  const rows = data.map((c: any) => ({
    linkedin_url:     c.linkedin_url ?? null,
    property_values:  c.property_values ?? {},
    last_enriched_at: c.last_enriched_at ?? null,
    source_tool:      c.source_tool ?? 'smartdata_import',
    created_at:       c.created_at,
    updated_at:       c.updated_at ?? c.created_at,
    // company_record_id intentionally omitted — re-link after both tables imported
  }))

  // Upsert on linkedin_url (dedup). Contacts without a linkedin_url are inserted fresh.
  const withLinkedin    = rows.filter(r => r.linkedin_url)
  const withoutLinkedin = rows.filter(r => !r.linkedin_url)

  let inserted = 0

  if (withLinkedin.length > 0) {
    const { error: e1 } = await target
      .from('sd_contact_records')
      .upsert(withLinkedin, { onConflict: 'linkedin_url', ignoreDuplicates: true })
    if (e1) throw new Error(`Target upsert error: ${e1.message}`)
    inserted += withLinkedin.length
  }

  if (withoutLinkedin.length > 0) {
    const { error: e2 } = await target
      .from('sd_contact_records')
      .insert(withoutLinkedin)
    if (e2) throw new Error(`Target insert error: ${e2.message}`)
    inserted += withoutLinkedin.length
  }

  return { fetched: data.length, inserted, duplicates: 0, skipped: 0, total: count ?? 0 }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      source     = 'smartdata',
      entity     = 'both',
      batch_size = 500,
      offset     = 0,
      dry_run    = false,
    } = body

    if (source !== 'smartdata') {
      return NextResponse.json({ error: 'Only source=smartdata supported' }, { status: 400 })
    }

    const sd = lovableSmartdataClient()
    const target = migrateTargetClient()
    const batchSize = Math.min(1000, Math.max(1, Number(batch_size)))
    const results: Record<string, any> = {}

    if (entity === 'companies' || entity === 'both') {
      results.companies = await migrateCompanies(sd, target, batchSize, Number(offset), Boolean(dry_run))
    }

    if (entity === 'contacts' || entity === 'both') {
      results.contacts = await migrateContacts(sd, target, batchSize, Number(offset), Boolean(dry_run))
    }

    // Calculate next_offset and done flag
    const mainEntity  = entity === 'both' ? 'contacts' : entity
    const entityResult = results[mainEntity] ?? results.companies
    const nextOffset  = Number(offset) + batchSize
    const done        = entityResult ? nextOffset >= entityResult.total : true

    return NextResponse.json({
      ...results,
      next_offset: done ? null : nextOffset,
      done,
      dry_run: Boolean(dry_run),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/* GET /api/data/migrate — count records in SmartData (preview before migration) */
export async function GET() {
  try {
    const sd = lovableSmartdataClient()

    const [contactCount, companyCount] = await Promise.all([
      sd.from('contact_records').select('*', { count: 'exact', head: true }),
      sd.from('company_records').select('*', { count: 'exact', head: true }),
    ])

    return NextResponse.json({
      smartdata: {
        contacts:  contactCount.count ?? 0,
        companies: companyCount.count ?? 0,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
