import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, fetchKonfhubFilters } from '@/app/lib/konfhub-agenda'

/* GET /api/events/konfhub/agenda-mapping?event_id=X
   PUT /api/events/konfhub/agenda-mapping?event_id=X
        Body: { stage_mode?: 'track' | 'tag', push_session_type?: boolean,
                stage_filter_id?: string | null, format_filter_id?: string | null, theme_filter_id?: string | null, room_filter_id?: string | null }

   Where each EventPilot agenda field lives in KonfHub for THIS event. DFFW teams made every stage a KonfHub track; BSS made one track and put the stage,
   the session type and the theme in tags of three KonfHub filters. EventPilot's fields stay fixed (stage, format, theme); this setting says which
   KonfHub filter carries each one. Picking a filter maps every tag in it (label = the tag's name) into event_konfhub_tag_map; passing null clears that
   field's mapping. Reads KonfHub live for the filter list. Gated on sae.integrations.manage. */

async function authorize(req: NextRequest, eventId: string) {
  const session = getSession(req)
  return !!session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage')
}

async function load(eventId: string, withFilters: boolean) {
  const [{ data: site }, { data: rows }] = await Promise.all([
    supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret, agenda_stage_mode, agenda_push_session_type').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('event_konfhub_tag_map').select('kind, label, tag_id').eq('event_id', eventId),
  ])
  let filters: { id: string; name: string; tags: { id: string; name: string }[] }[] = []
  let filterError: string | null = null
  if (withFilters && site?.konfhub_event_id && site.konfhub_client_id && site.konfhub_client_secret) {
    try { filters = await fetchKonfhubFilters(site.konfhub_event_id, await getKonfhubToken(site.konfhub_client_id, site.konfhub_client_secret)) }
    catch (e) { filterError = e instanceof Error ? e.message : 'Could not read the KonfHub filters.' }
  }
  const filterOf = (kind: string) => { const ids = new Set((rows ?? []).filter(r => r.kind === kind).map(r => r.tag_id)); return filters.find(f => f.tags.some(t => ids.has(t.id)))?.id ?? null }
  return {
    stage_mode: (site?.agenda_stage_mode as string | undefined) ?? 'track', push_session_type: site?.agenda_push_session_type ?? true,
    stage_filter_id: filterOf('stage'), format_filter_id: filterOf('format'), theme_filter_id: filterOf('theme'), room_filter_id: filterOf('room'),
    mapped: { stage: (rows ?? []).filter(r => r.kind === 'stage').length, format: (rows ?? []).filter(r => r.kind === 'format').length, theme: (rows ?? []).filter(r => r.kind === 'theme').length, room: (rows ?? []).filter(r => r.kind === 'room').length },
    filters, filter_error: filterError, konfhub_configured: !!site?.konfhub_event_id,
  }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  // ?labels=1: the small read the Agenda Builder uses to tell an editor where each field lives in KonfHub (agenda editors may not hold integrations access).
  if (req.nextUrl.searchParams.get('labels') === '1') {
    const session = getSession(req)
    if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.agenda.manage')) && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    const m = await load(eventId, true)
    const nameOf = (id: string | null) => m.filters.find(f => f.id === id)?.name ?? null
    // The stage tags mapped for this event, in KonfHub's own order — what a producer may add as a stage when stages live in a KonfHub tag.
    const { data: stageRows } = await supabaseAdmin.from('event_konfhub_tag_map').select('label, tag_id').eq('event_id', eventId).eq('kind', 'stage')
    const order = m.filters.find(f => f.id === m.stage_filter_id)?.tags.map(t => t.id) ?? []
    const stageTags = [...(stageRows ?? [])].sort((a, b) => (order.indexOf(a.tag_id) === -1 ? 999 : order.indexOf(a.tag_id)) - (order.indexOf(b.tag_id) === -1 ? 999 : order.indexOf(b.tag_id))).map(r => r.label as string)
    return NextResponse.json({ stage_mode: m.stage_mode, stage: nameOf(m.stage_filter_id), format: nameOf(m.format_filter_id), theme: nameOf(m.theme_filter_id), stage_tags: stageTags })
  }
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  return NextResponse.json(await load(eventId, true))
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { stage_mode?: string; push_session_type?: boolean; stage_filter_id?: string | null; format_filter_id?: string | null; theme_filter_id?: string | null; room_filter_id?: string | null } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data: site } = await supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', eventId).maybeSingle()
  const update: Record<string, unknown> = {}
  if (body.stage_mode !== undefined) { if (body.stage_mode !== 'track' && body.stage_mode !== 'tag') return NextResponse.json({ error: "stage_mode must be 'track' or 'tag'." }, { status: 400 }); update.agenda_stage_mode = body.stage_mode }
  if (body.push_session_type !== undefined) update.agenda_push_session_type = !!body.push_session_type
  if (Object.keys(update).length) {
    const { error } = await supabaseAdmin.from('event_websites').update(update).eq('event_id', eventId)
    if (error) return NextResponse.json({ error: error.message.includes('agenda_stage_mode') || error.message.includes('agenda_push_session_type') ? 'Run supabase/agenda_konfhub_mapping_migration.sql first.' : error.message }, { status: 500 })
  }

  const kinds: [string, string | null | undefined][] = [['stage', body.stage_filter_id], ['format', body.format_filter_id], ['theme', body.theme_filter_id], ['room', body.room_filter_id]]
  if (kinds.some(([, v]) => v !== undefined)) {
    if (!site?.konfhub_event_id || !site.konfhub_client_id || !site.konfhub_client_secret) return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 400 })
    const filters = await fetchKonfhubFilters(site.konfhub_event_id, await getKonfhubToken(site.konfhub_client_id, site.konfhub_client_secret))
    const used = new Set<string>()
    for (const [kind, filterId] of kinds) {
      if (filterId === undefined) continue
      if (filterId === null || filterId === '') { await supabaseAdmin.from('event_konfhub_tag_map').delete().eq('event_id', eventId).eq('kind', kind); continue }
      const f = filters.find(x => x.id === filterId)
      if (!f) return NextResponse.json({ error: `That filter was not found on KonfHub (${kind}).` }, { status: 400 })
      if (used.has(filterId)) return NextResponse.json({ error: 'The same KonfHub filter can only carry one field.' }, { status: 400 })
      used.add(filterId)
      await supabaseAdmin.from('event_konfhub_tag_map').delete().eq('event_id', eventId).eq('kind', kind)
      if (f.tags.length) {
        const { error } = await supabaseAdmin.from('event_konfhub_tag_map').insert(f.tags.map(t => ({ event_id: eventId, kind, label: t.name, tag_id: t.id })))
        if (error) return NextResponse.json({ error: error.message.includes('kind') ? 'Run supabase/agenda_konfhub_mapping_migration.sql first.' : error.message }, { status: 500 })
      }
    }
  }
  return NextResponse.json(await load(eventId, true))
}
