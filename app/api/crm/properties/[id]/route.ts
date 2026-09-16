import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* PATCH  /api/crm/properties/[id] — edit label/group/options/required (property_key and entity_type are immutable, same convention as FieldSchema.key)
   DELETE /api/crm/properties/[id] */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => null) as {
    label?: string; field_type?: string; group_id?: string | null; options?: string[]; is_required?: boolean
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.label !== undefined) update.label = body.label.trim()
  if (body.field_type !== undefined) update.field_type = body.field_type
  if (body.group_id !== undefined) update.group_id = body.group_id
  if (body.options !== undefined) update.options = body.options
  if (body.is_required !== undefined) update.is_required = body.is_required

  const { data, error } = await supabaseAdmin.from('crm_properties').update(update).eq('id', id).select('*, crm_property_groups(id, key, label, order_index)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const { error } = await supabaseAdmin.from('crm_properties').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
