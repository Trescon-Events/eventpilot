import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAgendaAccess } from '@/app/lib/agenda/access'

/* POST/PATCH/DELETE /api/events/agenda-v2/tracks

   Stages (rooms) are EventPilot's own now — creatable, renamable, reorderable
   and deletable for every event, KonfHub-linked or not (EventPilot owns the
   agenda; KonfHub is an adapter). Every write is scoped to the event in the
   request, so one event's permission can't touch another's stages. Deleting
   a stage leaves its sessions in place, unassigned (FK is ON DELETE SET NULL),
   and removes its KonfHub link rows (CASCADE). */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; name?: string; order_index?: number } | null
  if (!body?.event_id || !body.name?.trim()) return NextResponse.json({ error: 'event_id and name are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  let name = body.name.trim()
  // Tag mode (a stage is a tag of a KonfHub filter): only a tag KonfHub already has may become a stage, spelled exactly as KonfHub spells it,
  // so the website filter and the push keep matching. Works the same for every event that isn't in tag mode: any name goes.
  const { data: site } = await supabaseAdmin.from('event_websites').select('agenda_stage_mode').eq('event_id', body.event_id).maybeSingle()
  if (site?.agenda_stage_mode === 'tag') {
    const { data: tags } = await supabaseAdmin.from('event_konfhub_tag_map').select('label').eq('event_id', body.event_id).eq('kind', 'stage')
    const hit = (tags ?? []).find(t => (t.label as string).trim().toLowerCase() === name.toLowerCase())
    if (!hit) return NextResponse.json({ error: `In this event a stage must be one of KonfHub’s Stage tags (${(tags ?? []).map(t => t.label).join(', ') || 'none mapped yet — map them on the Integrations page'}).` }, { status: 400 })
    name = hit.label as string
  }
  const { data: dup } = await supabaseAdmin.from('event_agenda_tracks').select('id').eq('event_id', body.event_id).ilike('name', name.replace(/[%_]/g, m => `\\${m}`)).maybeSingle()
  if (dup) return NextResponse.json({ error: `A stage called “${name}” already exists.` }, { status: 409 })

  const { data, error } = await supabaseAdmin
    .from('event_agenda_tracks')
    .insert({ event_id: body.event_id, name, order_index: body.order_index ?? 0 })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create track' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { id?: string; event_id?: string; name?: string; order_index?: number; konfhub_track_title?: string | null } | null
  if (!body?.id || !body.event_id) return NextResponse.json({ error: 'id and event_id are required' }, { status: 400 })
  if (body.name !== undefined && !body.name.trim()) return NextResponse.json({ error: 'Name can’t be empty.' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('event_agenda_tracks')
    .update({ ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.order_index !== undefined ? { order_index: body.order_index } : {}), ...(body.konfhub_track_title !== undefined ? { konfhub_track_title: body.konfhub_track_title?.trim() || null } : {}), updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .eq('event_id', body.event_id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Stage not found in this event.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!id || !eventId) return NextResponse.json({ error: 'id and event_id required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, eventId)
  if (denied) return denied

  const { data, error } = await supabaseAdmin.from('event_agenda_tracks').delete().eq('id', id).eq('event_id', eventId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Stage not found in this event.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
