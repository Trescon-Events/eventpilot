import { supabaseAdmin } from '@/app/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/*
  POST /api/data/migrate
  Pulls contacts + companies from SmartData Supabase and imports them into TAOS.

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
*/

const SD_URL     = 'https://hgrkmzlynjztzjudsfgd.supabase.co'
// anon key extracted from SmartData JS bundle in prior session
const SD_ANON    = process.env.SMARTDATA_ANON_KEY ?? ''
const SD_SERVICE = process.env.SMARTDATA_SERVICE_ROLE_KEY ?? ''

function smartdataClient() {
  const key = SD_SERVICE || SD_ANON
  if (!key) throw new Error('SMARTDATA_ANON_KEY or SMARTDATA_SERVICE_ROLE_KEY not set in .env.local')
  return createClient(SD_URL, key)
}

async function migrateCompanies(sd: ReturnType<typeof createClient>, batchSize: number, offset: number, dryRun: boolean) {
  const { data, error, count } = await sd
    .from('sd_company_records')
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

  const { error: insertError } = await supabaseAdmin
    .from('sd_company_records')
    .upsert(rows, { onConflict: 'domain', ignoreDuplicates: true })

  if (insertError) throw new Error(`TAOS insert error: ${insertError.message}`)

  return { fetched: data.length, inserted: data.length, duplicates: 0, skipped: 0, total: count ?? 0 }
}

async function migrateContacts(sd: ReturnType<typeof createClient>, batchSize: number, offset: number, dryRun: boolean) {
  const { data, error, count } = await sd
    .from('sd_contact_records')
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
    const { error: e1 } = await supabaseAdmin
      .from('sd_contact_records')
      .upsert(withLinkedin, { onConflict: 'linkedin_url', ignoreDuplicates: true })
    if (e1) throw new Error(`TAOS upsert error: ${e1.message}`)
    inserted += withLinkedin.length
  }

  if (withoutLinkedin.length > 0) {
    const { error: e2 } = await supabaseAdmin
      .from('sd_contact_records')
      .insert(withoutLinkedin)
    if (e2) throw new Error(`TAOS insert error: ${e2.message}`)
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

    const sd = smartdataClient()
    const batchSize = Math.min(1000, Math.max(1, Number(batch_size)))
    const results: Record<string, any> = {}

    if (entity === 'companies' || entity === 'both') {
      results.companies = await migrateCompanies(sd, batchSize, Number(offset), Boolean(dry_run))
    }

    if (entity === 'contacts' || entity === 'both') {
      results.contacts = await migrateContacts(sd, batchSize, Number(offset), Boolean(dry_run))
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
    const sd = smartdataClient()

    const [contactCount, companyCount] = await Promise.all([
      sd.from('sd_contact_records').select('*', { count: 'exact', head: true }),
      sd.from('sd_company_records').select('*', { count: 'exact', head: true }),
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
