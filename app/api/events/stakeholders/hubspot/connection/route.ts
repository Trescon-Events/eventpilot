import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FormType, FORM_TYPES } from '@/app/lib/forms/types'

/* GET    /api/events/stakeholders/hubspot/connection?event_id=X&form_type=Y
   DELETE /api/events/stakeholders/hubspot/connection?event_id=X&form_type=Y

   Reads/removes an event's HubSpot form connection. Gated sae.forms.manage,
   same permission the per-event Form Builder already uses. Disconnecting
   simply deletes the row — the public form page falls back to the
   existing FieldSchema-driven form automatically once no connection exists. */

async function canManage(sid: string | undefined, eventId: string, adm: boolean | undefined) {
  if (adm) return true
  return hasEventPermission(sid, eventId, 'sae.forms.manage')
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const formType = req.nextUrl.searchParams.get('form_type')
  if (!eventId || !formType) return NextResponse.json({ error: 'event_id and form_type required' }, { status: 400 })
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!(await canManage(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('*')
    .eq('event_id', eventId).eq('form_type', formType)
    .maybeSingle()

  return NextResponse.json(data ?? { connected: false })
}

export async function DELETE(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const formType = req.nextUrl.searchParams.get('form_type')
  if (!eventId || !formType) return NextResponse.json({ error: 'event_id and form_type required' }, { status: 400 })
  if (!FORM_TYPES.includes(formType as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!(await canManage(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .delete()
    .eq('event_id', eventId).eq('form_type', formType)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
