import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/events/stakeholders/partners?event_id=X&type=Y&status=Z
   POST /api/events/stakeholders/partners

   Reads/writes the existing event_sponsors table (shared with Website
   Builder + KonfHub — see app/api/events/sponsors/route.ts, untouched by
   this file). Deliberately never writes `tier` or `active` — those drive
   the public website + KonfHub sync. This route only ever touches
   `announcement_status`/`partner_type` and the other SAE-specific columns
   added by supabase/sae_migration.sql.

   Request/response bodies use the PRD's field names (company_name,
   company_website) for a stable API contract; company_website maps to the
   pre-existing `website_url` column rather than duplicating it. */

type PartnerBody = {
  event_id: string
  company_name: string
  company_website?: string
  company_description?: string
  partner_type?: string
  source?: 'onboarding_form' | 'manual'
  created_by?: string
}

function toRow(body: Partial<PartnerBody>) {
  const row: Record<string, unknown> = {}
  if (body.event_id !== undefined) row.event_id = body.event_id
  if (body.company_name !== undefined) row.name = body.company_name
  if (body.company_website !== undefined) row.website_url = body.company_website || null
  if (body.company_description !== undefined) row.company_description = body.company_description || null
  if (body.partner_type !== undefined) row.partner_type = body.partner_type
  if (body.source !== undefined) row.source = body.source
  if (body.created_by !== undefined) row.created_by = body.created_by || null
  return row
}

function fromRow(row: Record<string, unknown>) {
  return { ...row, company_name: row.name, company_website: row.website_url }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const type    = req.nextUrl.searchParams.get('type')
  const status  = req.nextUrl.searchParams.get('status')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_sponsors')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (type) q = q.eq('partner_type', type)
  if (status) q = q.eq('announcement_status', status)
  else q = q.neq('announcement_status', 'archived')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(fromRow))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as PartnerBody | null
  if (!body?.event_id || !body?.company_name) {
    return NextResponse.json({ error: 'event_id and company_name required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .insert({ ...toRow(body), partner_type: body.partner_type ?? 'sponsor', source: body.source ?? 'manual' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(fromRow(data), { status: 201 })
}
