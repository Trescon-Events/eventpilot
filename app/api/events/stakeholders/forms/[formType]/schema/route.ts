import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FieldSchema, FormType, FORM_TYPES } from '@/app/lib/forms/types'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { validateFieldSchema } from '@/app/lib/forms/validate-schema'

/* GET/PUT/DELETE /api/events/stakeholders/forms/[formType]/schema?event_id=X

   GET is readable by anyone who can either MANAGE the schema (the Form
   Builder) or EDIT stakeholder records (the Hub's manual Add/Edit panel,
   which needs to render the resolved fields without needing full builder
   rights). PUT/DELETE — actually changing the schema — stay
   sae.forms.manage-only. Validation is shared with the global Form
   Templates route (app/api/admin/form-templates/[formType]/schema) via
   validateFieldSchema(). */

async function canRead(sid: string | undefined, eventId: string, adm: boolean | undefined) {
  if (adm) return true
  return (await hasEventPermission(sid, eventId, 'sae.forms.manage')) || (await hasEventPermission(sid, eventId, 'sae.stakeholders.edit'))
}
async function canManage(sid: string | undefined, eventId: string, adm: boolean | undefined) {
  if (adm) return true
  return hasEventPermission(sid, eventId, 'sae.forms.manage')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ formType: string }> }) {
  const { formType } = await params
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!(await canRead(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: override } = await supabaseAdmin
    .from('event_form_schemas')
    .select('fields')
    .eq('event_id', eventId).eq('form_type', formType)
    .maybeSingle()

  const fields = await resolveFormSchema(eventId, formType as FormType)
  return NextResponse.json({ fields, is_default: !override })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ formType: string }> }) {
  const { formType } = await params
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!(await canManage(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { fields?: FieldSchema[] } | null
  if (!body?.fields) return NextResponse.json({ error: 'fields required' }, { status: 400 })

  const err = validateFieldSchema(formType as FormType, body.fields)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_form_schemas')
    .upsert(
      { event_id: eventId, form_type: formType, fields: body.fields, updated_by: session?.sid ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,form_type' }
    )
    .select('fields')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fields: data.fields })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ formType: string }> }) {
  const { formType } = await params
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!(await canManage(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('event_form_schemas')
    .delete()
    .eq('event_id', eventId).eq('form_type', formType)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
