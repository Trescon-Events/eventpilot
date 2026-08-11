import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord, recordToFields } from '@/app/lib/forms/map-to-stakeholder-record'
import { FieldSchema, FormType, SubmittedValue } from '@/app/lib/forms/types'

/* PATCH  /api/events/stakeholders/partners/[id]
   DELETE /api/events/stakeholders/partners/[id] — soft delete (Hub "Delete")

   `fields`/`form_type` (schema-driven, Phase 4 — see ../route.ts's doc
   comment) are optional top-level keys alongside the pre-existing narrow
   flags below, which stay exactly as they were: never writes `tier` or
   `active` — those belong to the Website Builder / KonfHub flow — EXCEPT
   via the two narrow, explicit opt-in flags below (also_remove_from_website
   on DELETE, also_restore_to_website on PATCH), mirroring the speaker route
   (see its comment for the full rationale). */

type PartnerPatchBody = {
  fields?: Record<string, SubmittedValue>
  form_type?: FormType
  partner_type?: string
  announcement_status?: string
  notes?: string
  reviewed_by?: string
  also_restore_to_website?: boolean
}

function fromRow(row: Record<string, unknown>) {
  return { ...row, company_name: row.name, company_website: row.website_url }
}

function hasValue(v: SubmittedValue | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0
  return !!v && v.trim().length > 0
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as PartnerPatchBody | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('event_sponsors').select('event_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const session = getSession(req)
  const isEdit = 'announcement_status' in body === false || Object.keys(body).length > 1
  const permOk = isEdit
    ? await hasEventPermission(session?.sid, existing.event_id, 'sae.stakeholders.edit')
    : await hasEventPermission(session?.sid, existing.event_id, 'sae.approvals.approve')
  if (!session?.adm && !permOk) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const row: Record<string, unknown> = {}
  let schema: FieldSchema[] | null = null
  const formType: FormType = body.form_type ?? 'sponsor'

  if (body.fields) {
    schema = await resolveFormSchema(existing.event_id, formType)
    for (const f of schema) {
      if (f.required && f.type !== 'file' && !hasValue(body.fields[f.key])) {
        return NextResponse.json({ error: `${f.label} is required` }, { status: 400 })
      }
    }
    const { columns, customFields } = mapFieldsToRecord(formType, schema, body.fields, {})
    Object.assign(row, columns, { custom_fields: customFields })
  }
  if (body.partner_type !== undefined) row.partner_type = body.partner_type
  if (body.announcement_status !== undefined) row.announcement_status = body.announcement_status
  if (body.notes !== undefined) row.notes = body.notes || null
  if (body.reviewed_by !== undefined) { row.reviewed_by = body.reviewed_by || null; row.reviewed_at = new Date().toISOString() }
  if (body.also_restore_to_website) row.active = true

  if (Object.keys(row).length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  row.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .update(row)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const resolvedSchema = schema ?? await resolveFormSchema(existing.event_id, formType)
  return NextResponse.json({ ...fromRow(data), fields: recordToFields(formType, resolvedSchema, data) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { also_remove_from_website?: boolean }

  const { data: existing } = await supabaseAdmin.from('event_sponsors').select('event_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, existing.event_id, 'sae.stakeholders.delete'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const row: Record<string, unknown> = { announcement_status: 'archived', updated_at: new Date().toISOString() }
  if (body.also_remove_from_website) row.active = false

  const { error } = await supabaseAdmin
    .from('event_sponsors')
    .update(row)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
