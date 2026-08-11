import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { FieldSchema, FormType, FORM_TYPES } from '@/app/lib/forms/types'
import { defaultFieldsFor } from '@/app/lib/forms/default-schemas'
import { validateFieldSchema } from '@/app/lib/forms/validate-schema'

/* GET/PUT/DELETE /api/admin/form-templates/[formType]/schema

   Global default onboarding-form fields — the middle tier resolveFormSchema()
   falls back to when an event has no override of its own (see
   app/lib/forms/resolve-schema.ts). No event_id — this edits the shared
   baseline every event starts from. Gated exactly like Email Templates
   today (app/api/admin/email-templates/route.ts): plain session.adm, no
   sub-admin escape hatch — that's deferred to a separate future initiative
   per an explicit product decision, not an oversight. */

export async function GET(req: NextRequest, { params }: { params: Promise<{ formType: string }> }) {
  const { formType } = await params
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data } = await supabaseAdmin
    .from('form_schema_defaults')
    .select('fields')
    .eq('form_type', formType)
    .maybeSingle()

  return NextResponse.json({ fields: data?.fields ?? defaultFieldsFor(formType as FormType), is_default: !data })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ formType: string }> }) {
  const { formType } = await params
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { fields?: FieldSchema[] } | null
  if (!body?.fields) return NextResponse.json({ error: 'fields required' }, { status: 400 })

  const err = validateFieldSchema(formType as FormType, body.fields)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('form_schema_defaults')
    .upsert(
      { form_type: formType, fields: body.fields, updated_by: session.sid, updated_at: new Date().toISOString() },
      { onConflict: 'form_type' }
    )
    .select('fields')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fields: data.fields })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ formType: string }> }) {
  const { formType } = await params
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { error } = await supabaseAdmin.from('form_schema_defaults').delete().eq('form_type', formType)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
