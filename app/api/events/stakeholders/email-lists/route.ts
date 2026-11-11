import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* Saved email lists (2026-11-11). A list is saved filters plus people added or removed by hand; it is turned into recipients each time it is used.
   GET    ?event_id=…            lists usable from this event (its own, plus the ones made for any event)
   POST   { event_id, name, filters, pinned_contact_ids, excluded_contact_ids, allow_assistant, any_event? }
   PATCH  ?id=…  { name?, filters?, pinned_contact_ids?, excluded_contact_ids?, allow_assistant? }
   DELETE ?id=…
   Needs edit rights on the event; changing or deleting a list is for its creator or an admin. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : [])
const who = (s: { adm?: boolean; sid?: string | null }) => s.sid ?? (s.adm ? 'super-admin' : null)

async function allowed(session: ReturnType<typeof getSession>, eventId: string) {
  return !!session && (!!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit')))
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!UUID.test(eventId) || !(await allowed(session, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { data } = await supabaseAdmin.from('email_lists').select('*').or(`event_id.eq.${eventId},event_id.is.null`).order('name')
  return NextResponse.json({ lists: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const b = await req.json().catch(() => null) as { event_id?: string; name?: string; filters?: unknown; pinned_contact_ids?: unknown; excluded_contact_ids?: unknown; allow_assistant?: boolean; any_event?: boolean } | null
  if (!session || !b?.event_id || !UUID.test(b.event_id) || !(await allowed(session, b.event_id))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const name = (b.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Give the list a name.' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('email_lists').insert({
    name, audience_type: 'speaker', filters: b.filters && typeof b.filters === 'object' ? b.filters : {}, pinned_contact_ids: ids(b.pinned_contact_ids), excluded_contact_ids: ids(b.excluded_contact_ids),
    allow_assistant: !!b.allow_assistant, event_id: b.any_event ? null : b.event_id, created_by: who(session),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list: data })
}

async function loadOwned(req: NextRequest) {
  const session = getSession(req)
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!UUID.test(id)) return { error: NextResponse.json({ error: 'id required' }, { status: 400 }) }
  const { data: list } = await supabaseAdmin.from('email_lists').select('*').eq('id', id).maybeSingle()
  if (!list) return { error: NextResponse.json({ error: 'List not found.' }, { status: 404 }) }
  if (!session.adm && list.created_by !== who(session)) return { error: NextResponse.json({ error: 'Only the person who made a list, or an admin, can change it.' }, { status: 403 }) }
  return { list, session }
}

export async function PATCH(req: NextRequest) {
  const r = await loadOwned(req); if (r.error) return r.error
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.name === 'string') { if (!b.name.trim()) return NextResponse.json({ error: 'Give the list a name.' }, { status: 400 }); patch.name = b.name.trim() }
  if (b.filters && typeof b.filters === 'object') patch.filters = b.filters
  if ('pinned_contact_ids' in b) patch.pinned_contact_ids = ids(b.pinned_contact_ids)
  if ('excluded_contact_ids' in b) patch.excluded_contact_ids = ids(b.excluded_contact_ids)
  if (typeof b.allow_assistant === 'boolean') patch.allow_assistant = b.allow_assistant
  const { data, error } = await supabaseAdmin.from('email_lists').update(patch).eq('id', r.list!.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list: data })
}

export async function DELETE(req: NextRequest) {
  const r = await loadOwned(req); if (r.error) return r.error
  const { error } = await supabaseAdmin.from('email_lists').delete().eq('id', r.list!.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
