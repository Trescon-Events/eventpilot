import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/konfhub/tag-map?event_id=X
   PUT /api/events/konfhub/tag-map?event_id=X
        Body: { format: [{ label, tag_id }], room: [{ label, tag_id }] }

   The human-picked mapping between EventPilot agenda labels and this event's
   KonfHub tags, used when pushing sessions: a session's format (Keynote, Fireside
   Chat, Panel Discussion…) becomes its KonfHub "Session Type" tag, a session's
   room (Roundtable Room 1/2/3) its "Stage" tag. Chosen on the Integrations
   page after "Fetch Tags from KonfHub" — never auto-matched by name. PUT
   replaces each kind's whole list. Gated on sae.integrations.manage. */

type Entry = { label?: string; tag_id?: string }

async function authorize(req: NextRequest, eventId: string) {
  const session = getSession(req)
  return !!session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage')
}

async function load(eventId: string) {
  const { data } = await supabaseAdmin.from('event_konfhub_tag_map').select('kind, label, tag_id').eq('event_id', eventId).order('label')
  return { format: (data ?? []).filter(r => r.kind === 'format').map(r => ({ label: r.label, tag_id: r.tag_id })), room: (data ?? []).filter(r => r.kind === 'room').map(r => ({ label: r.label, tag_id: r.tag_id })) }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  return NextResponse.json(await load(eventId))
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { format?: Entry[]; room?: Entry[] } | null
  if (!body || (!Array.isArray(body.format) && !Array.isArray(body.room))) return NextResponse.json({ error: 'format and/or room arrays required' }, { status: 400 })

  for (const kind of ['format', 'room'] as const) {
    const list = body[kind]
    if (!Array.isArray(list)) continue
    const clean = list.map(e => ({ label: (e.label ?? '').trim(), tag_id: (e.tag_id ?? '').trim() }))
    if (clean.some(e => !e.label || !e.tag_id)) return NextResponse.json({ error: `Every ${kind} needs a label and a tag.` }, { status: 400 })
    if (new Set(clean.map(e => e.tag_id)).size !== clean.length) return NextResponse.json({ error: `The same KonfHub tag is mapped twice under ${kind}s.` }, { status: 400 })
    if (new Set(clean.map(e => e.label.toLowerCase())).size !== clean.length) return NextResponse.json({ error: `Two ${kind}s have the same label.` }, { status: 400 })
    await supabaseAdmin.from('event_konfhub_tag_map').delete().eq('event_id', eventId).eq('kind', kind)
    if (clean.length) {
      const { error } = await supabaseAdmin.from('event_konfhub_tag_map').insert(clean.map(e => ({ event_id: eventId, kind, label: e.label, tag_id: e.tag_id })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json(await load(eventId))
}
