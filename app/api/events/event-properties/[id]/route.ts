import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* PATCH  /api/events/event-properties/[id] — edit label/type/required/options/order_index
   DELETE /api/events/event-properties/[id] — remove

   `key` is immutable once created (same convention as FieldSchema.key —
   see app/lib/forms/types.ts), since it's what submitted_data/custom_fields
   is keyed by; changing it would silently orphan any data already stored
   under the old key. */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    label?: string; type?: string; required?: boolean; options?: string[]; order_index?: number
  } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('event_properties').select('event_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, existing.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  if (body.label !== undefined) update.label = body.label
  if (body.type !== undefined) update.type = body.type
  if (body.required !== undefined) update.required = body.required
  if (body.options !== undefined) update.options = body.options
  if (body.order_index !== undefined) update.order_index = body.order_index
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('event_properties').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: existing } = await supabaseAdmin.from('event_properties').select('event_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, existing.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('event_properties').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
