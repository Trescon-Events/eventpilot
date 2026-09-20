import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { RESERVED_FIELD_KEYS, FieldType } from '@/app/lib/forms/types'

/* GET  /api/events/event-properties?event_id=X — list this event's shared properties
   POST /api/events/event-properties — create one

   event_properties is a type-agnostic pool (see resolve-schema.ts's own
   comment) — unlike event_form_schemas, nothing here is scoped to
   speaker/sponsor/etc. Gated the same as the per-type Properties page
   (sae.forms.manage), since it's the same category of "who can change what
   fields exist for this event" concern. */

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_properties')
    .select('*')
    .eq('event_id', eventId)
    .order('order_index')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ properties: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    event_id?: string; key?: string; label?: string; type?: FieldType; required?: boolean; options?: string[]
  } | null
  if (!body?.event_id || !body?.key || !body?.label) {
    return NextResponse.json({ error: 'event_id, key, and label required' }, { status: 400 })
  }
  if (!KEY_PATTERN.test(body.key)) {
    return NextResponse.json({ error: 'Key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores' }, { status: 400 })
  }
  if (RESERVED_FIELD_KEYS.includes(body.key)) return NextResponse.json({ error: `"${body.key}" is a reserved key` }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { count } = await supabaseAdmin.from('event_properties').select('id', { count: 'exact', head: true }).eq('event_id', body.event_id)

  const { data, error } = await supabaseAdmin
    .from('event_properties')
    .insert({
      event_id: body.event_id, key: body.key, label: body.label,
      type: body.type ?? 'text', required: !!body.required, options: body.options ?? [],
      order_index: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `A property with key "${body.key}" already exists for this event.` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
