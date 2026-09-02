/**
 * Bulk Delegate Import API — Nic PRD 16 Jul 2026
 * POST — accepts a mapped set of rows and inserts them, skipping duplicates
 *
 * Client-side responsibility: read the CSV/XLSX file with xlsx, present the
 * header-mapping UI, then submit the already-mapped rows here as JSON. Keeps
 * this endpoint simple (no multipart handling) and gives the client instant
 * preview without a round-trip.
 *
 * Deduplication rule:
 *   - If a delegate with the same non-empty `email` already exists on this
 *     project → SKIP (do not overwrite existing data).
 *   - If no email is present on the incoming row → row is imported as-is
 *     (no dedupe against name-only records because names collide too often
 *     to auto-merge safely).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

type IncomingRow = {
  name?:         string | null
  company?:      string | null
  title?:        string | null
  industry?:     string | null
  email?:        string | null
  phone?:        string | null
  linkedin_url?: string | null
  source?:       string | null
  priority?:     string | null
  stage?:        string | null
  notes?:        string | null
}

type ImportResult = {
  imported:            number
  skipped_duplicates:  number
  skipped_no_name:     number
  errors:              string[]
  duplicate_emails:    string[]
}

const VALID_SOURCES  = new Set(['client_wishlist','internal_db','linkedin','referral','marketing','other'])
const VALID_PRIORITIES = new Set(['nice_to_have','important','must_have'])
const VALID_STAGES   = new Set(['sourced','contacted','interested','registered','confirmed','attended'])

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const body = await req.json().catch(() => null) as { project_id?: string; rows?: IncomingRow[] } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const projectId = String(body.project_id ?? '').trim()
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const rows = Array.isArray(body.rows) ? body.rows : null
  if (!rows) return NextResponse.json({ error: 'rows array required' }, { status: 400 })
  if (rows.length === 0) return NextResponse.json({ error: 'rows array is empty' }, { status: 400 })
  if (rows.length > 5000) return NextResponse.json({ error: 'Max 5000 rows per import' }, { status: 400 })

  // Pull existing emails for this project — used for dedup
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('bespoke_delegates')
    .select('email')
    .eq('project_id', projectId)
    .not('email', 'is', null)

  if (existingErr) {
    return NextResponse.json({ error: `Could not check existing delegates: ${existingErr.message}` }, { status: 500 })
  }

  const existingEmails = new Set(
    (existing ?? []).map(r => (r.email ?? '').toString().trim().toLowerCase()).filter(Boolean),
  )

  // Also dedupe within the incoming batch itself (someone might import the same email twice in one file)
  const seenInBatch = new Set<string>()

  const toInsert: Record<string, unknown>[] = []
  const skippedEmails: string[] = []
  let skippedNoName = 0
  const errors: string[] = []

  rows.forEach((r, i) => {
    const name = clean(r.name)
    if (!name) { skippedNoName += 1; return }

    const emailRaw = clean(r.email)
    const emailKey = emailRaw ? emailRaw.toLowerCase() : null

    if (emailKey) {
      if (existingEmails.has(emailKey) || seenInBatch.has(emailKey)) {
        skippedEmails.push(emailRaw!)
        return
      }
      seenInBatch.add(emailKey)
    }

    const source   = clean(r.source)
    const priority = clean(r.priority)
    const stage    = clean(r.stage)

    if (source && !VALID_SOURCES.has(source))       errors.push(`Row ${i + 1}: invalid source "${source}" — using default`)
    if (priority && !VALID_PRIORITIES.has(priority)) errors.push(`Row ${i + 1}: invalid priority "${priority}" — using default`)
    if (stage && !VALID_STAGES.has(stage))          errors.push(`Row ${i + 1}: invalid stage "${stage}" — using default`)

    toInsert.push({
      project_id:   projectId,
      name,
      company:      clean(r.company),
      title:        clean(r.title),
      industry:     clean(r.industry),
      email:        emailRaw,
      phone:        clean(r.phone),
      linkedin_url: clean(r.linkedin_url),
      source:       source && VALID_SOURCES.has(source) ? source : 'client_wishlist',
      priority:     priority && VALID_PRIORITIES.has(priority) ? priority : 'nice_to_have',
      stage:        stage && VALID_STAGES.has(stage) ? stage : 'sourced',
      notes:        clean(r.notes),
    })
  })

  let imported = 0
  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('bespoke_delegates')
      .insert(toInsert)
      .select('id')

    if (insertErr) {
      return NextResponse.json({
        error: `Insert failed after validation: ${insertErr.message}`,
        would_have_imported: toInsert.length,
        skipped_duplicates: skippedEmails.length,
        skipped_no_name: skippedNoName,
      }, { status: 500 })
    }
    imported = inserted?.length ?? 0
  }

  const result: ImportResult = {
    imported,
    skipped_duplicates: skippedEmails.length,
    skipped_no_name:    skippedNoName,
    errors,
    duplicate_emails:   skippedEmails.slice(0, 20), // cap to avoid huge responses
  }

  return NextResponse.json(result, { status: 201 })
}
