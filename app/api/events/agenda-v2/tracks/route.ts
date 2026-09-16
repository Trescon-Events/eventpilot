import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

async function requireAgendaAccess(req: NextRequest, eventId: string) {
  const session = getSession(req)
  if (session?.adm) return null
  if (await hasEventPermission(session?.sid, eventId, 'sae.agenda.manage')) return null
  return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
}

/* POST/PATCH/DELETE /api/events/agenda-v2/tracks

   Create is only ever allowed for eventpilot_native events — for
   konfhub_authoritative events, a track can only come into existence via
   the fetch-and-reconcile flow (POST /api/events/konfhub/map-track), never
   a bare "+ Add Stage" here. Enforced server-side, not just by hiding the
   button in the UI. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; name?: string; order_index?: number } | null
  if (!body?.event_id || !body.name?.trim()) return NextResponse.json({ error: 'event_id and name are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const { data: website } = await supabaseAdmin.from('event_websites').select('agenda_source').eq('event_id', body.event_id).single()
  if (website?.agenda_source === 'konfhub_authoritative') {
    return NextResponse.json({ error: 'This event\'s agenda structure is authoritative on KonfHub — fetch and map a track instead of creating one here.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_agenda_tracks')
    .insert({ event_id: body.event_id, name: body.name.trim(), order_index: body.order_index ?? 0 })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create track' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { id?: string; event_id?: string; name?: string; order_index?: number } | null
  if (!body?.id || !body.event_id) return NextResponse.json({ error: 'id and event_id are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('event_agenda_tracks')
    .update({ ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.order_index !== undefined ? { order_index: body.order_index } : {}), updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to update track' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!id || !eventId) return NextResponse.json({ error: 'id and event_id required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, eventId)
  if (denied) return denied

  const { data: website } = await supabaseAdmin.from('event_websites').select('agenda_source').eq('event_id', eventId).single()
  if (website?.agenda_source === 'konfhub_authoritative') {
    return NextResponse.json({ error: 'This event\'s agenda structure is authoritative on KonfHub — it cannot be deleted here.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('event_agenda_tracks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
