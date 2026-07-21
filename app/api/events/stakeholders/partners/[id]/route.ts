import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* PATCH  /api/events/stakeholders/partners/[id]
   DELETE /api/events/stakeholders/partners/[id] — soft delete

   Same field-name mapping as ../route.ts. Never writes `tier` or `active` —
   those belong to the Website Builder / KonfHub flow. */

type PartnerPatchBody = {
  company_name?: string
  company_website?: string
  company_description?: string
  partner_type?: string
  announcement_status?: string
  notes?: string
  reviewed_by?: string
}

function toRow(body: PartnerPatchBody) {
  const row: Record<string, unknown> = {}
  if (body.company_name !== undefined) row.name = body.company_name
  if (body.company_website !== undefined) row.website_url = body.company_website || null
  if (body.company_description !== undefined) row.company_description = body.company_description || null
  if (body.partner_type !== undefined) row.partner_type = body.partner_type
  if (body.announcement_status !== undefined) row.announcement_status = body.announcement_status
  if (body.notes !== undefined) row.notes = body.notes || null
  if (body.reviewed_by !== undefined) { row.reviewed_by = body.reviewed_by || null; row.reviewed_at = new Date().toISOString() }
  return row
}

function fromRow(row: Record<string, unknown>) {
  return { ...row, company_name: row.name, company_website: row.website_url }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as PartnerPatchBody | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const row = toRow(body)
  if (Object.keys(row).length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  row.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .update(row)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(fromRow(data))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin
    .from('event_sponsors')
    .update({ announcement_status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
