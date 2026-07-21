import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/events/stakeholders/speakers?event_id=X&status=Y
   POST /api/events/stakeholders/speakers

   Reads/writes the existing event_speakers table (shared with Website
   Builder + KonfHub — see app/api/events/speakers/route.ts, untouched by
   this file). Deliberately never writes `status`, `tier`, or `active` —
   those drive the public website + KonfHub sync. This route only ever
   touches `announcement_status` and the SAE-specific columns added by
   supabase/sae_migration.sql.

   Request/response bodies use the PRD's field names (full_name, job_title,
   company_name) for a stable API contract; internally these map to the
   pre-existing columns (name, role, company) rather than duplicating them. */

type SpeakerBody = {
  event_id: string
  full_name: string
  job_title: string
  company_name: string
  country?: string
  bio?: string
  linkedin_url?: string
  source?: 'onboarding_form' | 'manual'
  created_by?: string
}

function toRow(body: Partial<SpeakerBody>) {
  const row: Record<string, unknown> = {}
  if (body.event_id !== undefined) row.event_id = body.event_id
  if (body.full_name !== undefined) row.name = body.full_name
  if (body.job_title !== undefined) row.role = body.job_title
  if (body.company_name !== undefined) row.company = body.company_name
  if (body.country !== undefined) row.country = body.country || null
  if (body.bio !== undefined) row.bio = body.bio || null
  if (body.linkedin_url !== undefined) row.linkedin_url = body.linkedin_url || null
  if (body.source !== undefined) row.source = body.source
  if (body.created_by !== undefined) row.created_by = body.created_by || null
  return row
}

function fromRow(row: Record<string, unknown>) {
  return {
    ...row,
    full_name: row.name,
    job_title: row.role,
    company_name: row.company,
  }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const status  = req.nextUrl.searchParams.get('status')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_speakers')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (status) q = q.eq('announcement_status', status)
  else q = q.neq('announcement_status', 'archived') // archived hidden from the default (all-statuses) view

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(fromRow))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as SpeakerBody | null
  if (!body?.event_id || !body?.full_name || !body?.job_title || !body?.company_name) {
    return NextResponse.json({ error: 'event_id, full_name, job_title, company_name required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .insert({ ...toRow(body), source: body.source ?? 'manual' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(fromRow(data), { status: 201 })
}
