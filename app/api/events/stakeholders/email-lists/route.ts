import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { loadPool } from '@/app/lib/emails/people'
import { audienceOfList, cleanFilters, loadSavedList, resolveAudienceWith, visibleEventIds } from '@/app/lib/emails/audience'
import { buildPeople, type Person } from '@/app/lib/emails/recipients'

/* Emails → Lists (2026-11-12). A list is who an email goes to. Two kinds, as in HubSpot:
     ACTIVE  keeps only its criteria and is worked out again every time it is used, so when more speakers match later it grows by itself.
     STATIC  the people matching when it was made are copied in and stay; individuals can still be added or removed by hand.
   GET    ?event_id=…            the lists usable from this event with their type, size and the emails that used them
   GET    ?event_id=…&id=…       one list in detail: its people, the emails that used it and (active) who joined since the last email
   POST   { event_id, name, description?, type: 'static'|'active', filters, excluded_contact_ids?, any_event? }     (a static list is filled from the filters now)
   PATCH  ?id=…  { name?, description?, filters? (active), excluded_contact_ids?, add_members?, remove_members?, add_from_filters? (static) }
   DELETE ?id=…                  refused while a scheduled or sending email uses it
   Needs edit rights on the event; changing or deleting a list is for its creator or an admin. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY = /^(c|e|s):.{1,200}$/
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : [])
const keys = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && KEY.test(x)) : [])
const who = (s: { adm?: boolean; sid?: string | null }) => s.sid ?? (s.adm ? 'super-admin' : null)

async function allowed(session: ReturnType<typeof getSession>, eventId: string) {
  return !!session && (!!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit')))
}
const brief = (p: Person) => ({ key: p.key, contact_id: p.contact_id, name: p.name, company: p.company, role: p.rep.role, country: p.country, statuses: p.statuses, last_event_end: p.last_event_end, last_emailed: p.last_emailed, producer: p.rep.producer_name })

export async function GET(req: NextRequest) {
  const session = getSession(req)
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!UUID.test(eventId) || !(await allowed(session, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const one = req.nextUrl.searchParams.get('id')
  const data = await loadPool(await visibleEventIds(session))

  if (one) {
    if (!UUID.test(one)) return NextResponse.json({ error: 'id invalid' }, { status: 400 })
    const l = await loadSavedList(one)
    if (!l) return NextResponse.json({ error: 'List not found.' }, { status: 404 })
    const { data: meta } = await supabaseAdmin.from('email_lists').select('description, created_by, created_at, updated_at').eq('id', one).single()
    const a = resolveAudienceWith(data, audienceOfList(l))
    const { data: used } = await supabaseAdmin.from('email_campaigns').select('id, name, status, created_at, event_id').eq('list_id', one).neq('status', 'draft').order('created_at', { ascending: false }).limit(20)
    // active lists: who matches now but was not in the last email that used the list
    let joined: string[] = []
    const last = (used ?? []).find(u => u.status === 'sent' || u.status === 'sending')
    if (l.type === 'active' && last) {
      const { data: prev } = await supabaseAdmin.from('email_campaign_recipients').select('contact_id').eq('campaign_id', last.id).limit(5000)
      const was = new Set((prev ?? []).map(r => r.contact_id as string | null).filter(Boolean))
      joined = a.recipients.filter(r => r.contact_id && !was.has(r.contact_id)).map(r => r.name)
    }
    return NextResponse.json({
      list: { id: l.id, name: l.name, type: l.type, filters: l.filters, excluded: l.excluded, members: l.members.length, event_id: l.event_id, description: meta?.description ?? null, created_at: meta?.created_at, updated_at: meta?.updated_at },
      summary: a.summary,
      people: [...a.recipients.map(r => ({ ...brief(r), to: r.to, cc: r.cc, via_contact: r.mode === 'assistant', reason: null as string | null })), ...a.excluded.map(e => ({ ...brief(e.person), to: null, cc: [] as string[], via_contact: false, reason: e.reason }))],
      used_in: used ?? [], joined_since_last_email: joined,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: lists } = await supabaseAdmin.from('email_lists').select('id, name, description, list_type, filters, members, excluded_contact_ids, pinned_contact_ids, event_id, created_by, created_at, updated_at').or(`event_id.eq.${eventId},event_id.is.null`).order('name')
  const listIds = (lists ?? []).map(l => l.id as string)
  const { data: used } = listIds.length ? await supabaseAdmin.from('email_campaigns').select('list_id, status').in('list_id', listIds).neq('status', 'draft') : { data: [] }
  const usedBy = new Map<string, number>(), live = new Set<string>()
  for (const u of used ?? []) { usedBy.set(u.list_id as string, (usedBy.get(u.list_id as string) ?? 0) + 1); if (u.status === 'scheduled' || u.status === 'sending') live.add(u.list_id as string) }
  const out = (lists ?? []).map(l => {
    const sl = { id: l.id as string, name: l.name as string, type: (l.list_type as 'static' | 'active') ?? 'active', filters: cleanFilters(l.filters as never), members: (l.members as string[]) ?? [], pinned: (l.pinned_contact_ids as string[]) ?? [], excluded: (l.excluded_contact_ids as string[]) ?? [], event_id: (l.event_id as string | null) ?? null }
    const a = resolveAudienceWith(data, audienceOfList(sl))
    return { id: l.id, name: l.name, description: l.description, type: sl.type, event_id: l.event_id, created_by: l.created_by, created_at: l.created_at, updated_at: l.updated_at, will_receive: a.summary.will_receive, people: a.summary.will_receive + a.summary.excluded, used_in: usedBy.get(l.id as string) ?? 0, in_use: live.has(l.id as string) }
  })
  return NextResponse.json({ lists: out, facets: { events: data.events, producers: data.producers, roles: data.roles, countries: data.countries } }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const b = await req.json().catch(() => null) as { event_id?: string; name?: string; description?: string; type?: string; filters?: unknown; excluded_contact_ids?: unknown; any_event?: boolean } | null
  if (!session || !b?.event_id || !UUID.test(b.event_id) || !(await allowed(session, b.event_id))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const name = (b.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Give the list a name.' }, { status: 400 })
  if (name.length > 200) return NextResponse.json({ error: 'The name is too long.' }, { status: 400 })
  const type = b.type === 'static' ? 'static' : 'active'
  const filters = cleanFilters(b.filters as never)
  let members: string[] = []
  if (type === 'static') {
    const data = await loadPool(await visibleEventIds(session))
    members = buildPeople(data.pool, filters, new Date(), data.lastEmailed).map(p => p.key)
    if (!members.length) return NextResponse.json({ error: 'Nobody matches these criteria yet, so there is nothing to put in a static list. Use an active list to catch people who match later.' }, { status: 422 })
  }
  const { data, error } = await supabaseAdmin.from('email_lists').insert({
    name, description: (b.description ?? '').trim() || null, audience_type: 'speaker', list_type: type, filters, members, excluded_contact_ids: ids(b.excluded_contact_ids), allow_assistant: false,
    event_id: b.any_event ? null : b.event_id, created_by: who(session),
  }).select('id, name, list_type').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list: data, members: members.length })
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
  if (typeof b.name === 'string') { if (!b.name.trim()) return NextResponse.json({ error: 'Give the list a name.' }, { status: 400 }); patch.name = b.name.trim().slice(0, 200) }
  if (typeof b.description === 'string') patch.description = b.description.trim() || null
  if ('excluded_contact_ids' in b) patch.excluded_contact_ids = ids(b.excluded_contact_ids)
  const isStatic = r.list!.list_type === 'static'
  if (!isStatic && b.filters && typeof b.filters === 'object') patch.filters = cleanFilters(b.filters as never)
  if (isStatic) {
    const members = new Set<string>((r.list!.members as string[]) ?? [])
    for (const k of keys(b.add_members)) members.add(k)
    for (const k of keys(b.remove_members)) members.delete(k)
    if (b.add_from_filters && typeof b.add_from_filters === 'object') {
      const data = await loadPool(await visibleEventIds(r.session!))
      for (const p of buildPeople(data.pool, cleanFilters(b.add_from_filters as never), new Date(), data.lastEmailed)) members.add(p.key)
    }
    if ('add_members' in b || 'remove_members' in b || 'add_from_filters' in b) patch.members = [...members]
  }
  const { data, error } = await supabaseAdmin.from('email_lists').update(patch).eq('id', r.list!.id).select('id, name, list_type').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list: data })
}

export async function DELETE(req: NextRequest) {
  const r = await loadOwned(req); if (r.error) return r.error
  const { count } = await supabaseAdmin.from('email_campaigns').select('id', { count: 'exact', head: true }).eq('list_id', r.list!.id).in('status', ['scheduled', 'sending'])
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'A scheduled or sending email uses this list. Cancel that email first, or change its list.' }, { status: 409 })
  const { error } = await supabaseAdmin.from('email_lists').delete().eq('id', r.list!.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
