import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { recompileEventAndChildren } from '@/app/lib/content/compile-reference'

/* POST /api/events/umbrellas/attach   Body: { event_id, umbrella_id: string | null }
   Puts an existing event under a SERIES umbrella (writes events.umbrella_id), or takes it out again (umbrella_id null — only from a
   series). Platform admin only. Only series umbrellas can be targeted or left here: moving events in or out of a client umbrella
   (DFFW) is a Staff Portal matter. The 12 Oct sync rule keeps an EventPilot-set umbrella: run-sync.ts only writes umbrella_id when
   Staff Portal names one. The event's compiled reference is rebuilt because its effective document set just changed. (2026-10-15) */
/* GET — the events a platform admin can pick from: { id, name, umbrella_id } for every event, newest first. */
export async function GET(req: NextRequest) {
  if (!getSession(req)?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { data, error } = await supabaseAdmin.from('events').select('id, name, umbrella_id').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(e => ({ ...e, name: (e.name as string).trim() })))
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Only a platform admin can attach events to a series.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { event_id?: string; umbrella_id?: string | null } | null
  if (!body?.event_id || body.umbrella_id === undefined) return NextResponse.json({ error: 'event_id and umbrella_id required.' }, { status: 400 })

  const { data: ev } = await supabaseAdmin.from('events').select('id, umbrella_id').eq('id', body.event_id).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const seriesIds = async (id: string | null) => {
    if (!id) return true
    const { data } = await supabaseAdmin.from('event_umbrellas').select('type, client_name').eq('id', id).maybeSingle()
    return !!data && data.type === 'series' && !(data.client_name ?? '').trim()
  }
  if (!(await seriesIds(body.umbrella_id))) return NextResponse.json({ error: 'That umbrella is not a series. Only Trescon series can be attached to here.' }, { status: 400 })
  if (ev.umbrella_id && ev.umbrella_id !== body.umbrella_id && !(await seriesIds(ev.umbrella_id))) {
    return NextResponse.json({ error: 'This event belongs to a client umbrella; that is managed from Staff Portal.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('events').update({ umbrella_id: body.umbrella_id }).eq('id', ev.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recompileEventAndChildren({ kind: 'event', id: ev.id })
  return NextResponse.json({ ok: true, event_id: ev.id, umbrella_id: body.umbrella_id })
}
