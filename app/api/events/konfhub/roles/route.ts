import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getEventRoles } from '@/app/lib/konfhub/roles'

/* GET /api/events/konfhub/roles?event_id=X  — the event's configured roles
   PUT /api/events/konfhub/roles?event_id=X  — replace them
        Body: { roles: [{ tag_id, label }] } in display order.

   Roles are the KonfHub tags a human ticked after "Fetch Tags from KonfHub"
   on the Integrations page (Speaker, Moderator, Roundtable Chair, ...) — never
   auto-matched by name. A role still in use (a speaker's main listing role,
   or an additional-role record on KonfHub) can't be removed: 409 with the
   counts, so a live KonfHub record never loses the role it's mapped to.
   Gated on sae.integrations.manage like the rest of the KonfHub config. */

async function authorize(req: NextRequest, eventId: string) {
  const session = getSession(req)
  return !!session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage')
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  return NextResponse.json({ roles: await getEventRoles(eventId) })
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await authorize(req, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { roles?: { tag_id?: string; label?: string }[] } | null
  if (!Array.isArray(body?.roles)) return NextResponse.json({ error: 'roles array required' }, { status: 400 })

  const roles = body!.roles.map(r => ({ tag_id: (r.tag_id ?? '').trim(), label: (r.label ?? '').trim() }))
  if (roles.some(r => !r.tag_id || !r.label)) return NextResponse.json({ error: 'Every role needs a tag and a label.' }, { status: 400 })
  if (new Set(roles.map(r => r.tag_id)).size !== roles.length) return NextResponse.json({ error: 'The same KonfHub tag is listed twice.' }, { status: 400 })
  if (new Set(roles.map(r => r.label.toLowerCase())).size !== roles.length) return NextResponse.json({ error: 'Two roles have the same label.' }, { status: 400 })

  const current = await getEventRoles(eventId)
  const removed = current.filter(c => !roles.some(r => r.tag_id === c.tag_id))
  if (removed.length > 0) {
    const { data: speakers } = await supabaseAdmin.from('event_speakers').select('id, konfhub_primary_role_tag_id').eq('event_id', eventId)
    const ids = (speakers ?? []).map(s => s.id)
    const { data: extras } = ids.length
      ? await supabaseAdmin.from('speaker_konfhub_roles').select('tag_id').in('speaker_id', ids)
      : { data: [] as { tag_id: string }[] }
    const inUse = removed.map(r => ({
      label: r.label,
      n: (speakers ?? []).filter(s => s.konfhub_primary_role_tag_id === r.tag_id).length + (extras ?? []).filter(x => x.tag_id === r.tag_id).length,
    })).filter(x => x.n > 0)
    if (inUse.length > 0) {
      return NextResponse.json({ error: `Can’t remove ${inUse.map(x => `${x.label} (used by ${x.n} listing${x.n === 1 ? '' : 's'})`).join(', ')} — change those speakers’ roles first.` }, { status: 409 })
    }
    await supabaseAdmin.from('event_konfhub_roles').delete().eq('event_id', eventId).in('tag_id', removed.map(r => r.tag_id))
  }

  if (roles.length > 0) {
    const { error } = await supabaseAdmin.from('event_konfhub_roles').upsert(
      roles.map((r, i) => ({ event_id: eventId, tag_id: r.tag_id, label: r.label, sort_order: i })),
      { onConflict: 'event_id,tag_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ roles: await getEventRoles(eventId) })
}
