import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { createCampaign, displayText } from '@/app/lib/emails/campaigns'
import { createScheduledCampaign } from '@/app/lib/emails/scheduled'
import { visibleEventIds, type AudienceInput } from '@/app/lib/emails/audience'
import type { SpeakerAttachment } from '@/app/lib/speaker-emails/render'

/* Emails → the emails themselves (2026-11-12).
   GET  ?event_id=…[&scope=event|all][&filter_event_id=…][&umbrella_id=…][&status=…][&q=…]
        every email (drafts included), newest first, with its event, umbrella, owner and numbers. scope=event (default) is this event's emails; scope=all is every event the
        signed-in person can access, narrowed by event, umbrella, status or a search on the name and subject.
   POST { event_id, name, subject, body_html, attachments?, polished?, original_html?, list_id, sender_mode, confirmed?, template_id?, field_values?, send_at_local?, owner_staff_id?,
          remember_owner?, pace_hours?, skip_unpersonalisable?, draft_id? }
        creates the email and starts it (or schedules it when send_at_local is given). event_id is the event it belongs to; the caller needs edit rights there. More than 20 people needs
        confirmed: true; more than 50 needs the sae.emails.send_bulk permission. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const eventId = p.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const all = p.get('scope') === 'all'
  const filterEvent = p.get('filter_event_id') ?? ''
  const umbrellaId = p.get('umbrella_id') ?? ''
  const status = p.get('status') ?? ''
  const q = (p.get('q') ?? '').trim().toLowerCase()

  let ids: string[] | null = [eventId]
  if (all) ids = await visibleEventIds(session)
  if (UUID.test(filterEvent)) ids = ids ? ids.filter(i => i === filterEvent) : [filterEvent]
  if (UUID.test(umbrellaId)) {
    const { data: kids } = await supabaseAdmin.from('events').select('id').eq('umbrella_id', umbrellaId)
    const kidIds = (kids ?? []).map(k => k.id as string)
    ids = ids ? ids.filter(i => kidIds.includes(i)) : kidIds
  }

  let query = supabaseAdmin.from('email_campaigns').select('id, name, subject, status, event_id, recipient_count, created_by, owner_staff_id, created_at, sent_at, sender_mode, polished, scheduled_for, timezone, field_values, pace_hours').order('created_at', { ascending: false }).limit(500)
  if (ids) query = query.in('event_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  if (status) query = query.eq('status', status)
  const { data: camps } = await query
  const list = (camps ?? []).filter(c => !q || `${c.name} ${c.subject}`.toLowerCase().includes(q))

  const campIds = list.map(c => c.id as string)
  const counts = new Map<string, Record<string, number>>()
  for (let i = 0; i < campIds.length; i += 100) {
    const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('campaign_id, status, reply_type, bounce_kind, stop_requested').in('campaign_id', campIds.slice(i, i + 100)).limit(20000)
    for (const r of rows ?? []) {
      const m = counts.get(r.campaign_id as string) ?? {}
      m[r.status as string] = (m[r.status as string] ?? 0) + 1
      if (r.reply_type && r.reply_type !== 'none') m[`reply_${r.reply_type}`] = (m[`reply_${r.reply_type}`] ?? 0) + 1
      if (r.reply_type === 'bounce' && r.bounce_kind === 'hard') m.bounce_hard = (m.bounce_hard ?? 0) + 1
      if (r.stop_requested) m.stop_requested = (m.stop_requested ?? 0) + 1
      counts.set(r.campaign_id as string, m)
    }
  }
  const staffIds = [...new Set(list.flatMap(c => [c.created_by, c.owner_staff_id]).filter((x): x is string => typeof x === 'string' && UUID.test(x)))]
  const { data: staff } = staffIds.length ? await supabaseAdmin.from('staff_members').select('id, name').in('id', staffIds) : { data: [] }
  const who = new Map((staff ?? []).map(s => [s.id as string, s.name as string]))
  const evIds = [...new Set(list.map(c => c.event_id as string))]
  const { data: evs } = evIds.length ? await supabaseAdmin.from('events').select('id, name, umbrella_id').in('id', evIds) : { data: [] }
  const umIds = [...new Set((evs ?? []).map(e => e.umbrella_id as string | null).filter((x): x is string => !!x))]
  const { data: ums } = umIds.length ? await supabaseAdmin.from('event_umbrellas').select('id, name').in('id', umIds) : { data: [] }
  const umName = new Map((ums ?? []).map(u => [u.id as string, u.name as string]))
  const evInfo = new Map((evs ?? []).map(e => [e.id as string, { name: e.name as string, umbrella: e.umbrella_id ? umName.get(e.umbrella_id as string) ?? null : null }]))

  const campaigns = await Promise.all(list.map(async c => {
    const { field_values, ...rest } = c
    const unreleased = c.status === 'scheduled' || c.status === 'cancelled' || c.status === 'draft'
    return {
      ...rest, subject: unreleased ? await displayText(c.event_id as string, c.subject as string, field_values as Record<string, unknown>, true) : c.subject,
      created_by_name: who.get(c.created_by as string) ?? null, owner_name: who.get(c.owner_staff_id as string) ?? null,
      event_name: evInfo.get(c.event_id as string)?.name ?? null, umbrella_name: evInfo.get(c.event_id as string)?.umbrella ?? null, counts: counts.get(c.id as string) ?? {},
    }
  }))

  // the filter choices for the page: the events (and umbrellas) that have emails in this scope
  const { data: scopeEv } = all
    ? await (ids ? supabaseAdmin.from('events').select('id, name, umbrella_id').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']) : supabaseAdmin.from('events').select('id, name, umbrella_id'))
    : { data: evs }
  const { data: allUm } = await supabaseAdmin.from('event_umbrellas').select('id, name')
  const usedUm = new Set((scopeEv ?? []).map(e => e.umbrella_id as string | null).filter((x): x is string => !!x))
  return NextResponse.json({
    campaigns,
    events: (scopeEv ?? []).map(e => ({ id: e.id, name: e.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    umbrellas: (allUm ?? []).filter(u => usedUm.has(u.id as string)).map(u => ({ id: u.id, name: u.name })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'Choose the event this email belongs to.' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (typeof b?.subject !== 'string' || typeof b?.body_html !== 'string' || typeof b?.name !== 'string') return NextResponse.json({ error: 'name, subject and body_html are required' }, { status: 400 })
  if (b.body_html.length > 80_000) return NextResponse.json({ error: 'That email is too long.' }, { status: 400 })
  if (typeof b.list_id !== 'string' || !UUID.test(b.list_id)) return NextResponse.json({ error: 'Choose the list this email goes to.' }, { status: 400 })

  const common = {
    eventId, name: b.name, subject: b.subject, bodyHtml: b.body_html, attachments: (Array.isArray(b.attachments) ? b.attachments : []) as SpeakerAttachment[],
    polished: !!b.polished, originalHtml: typeof b.original_html === 'string' ? b.original_html : null, listId: b.list_id as string,
    senderMode: (b.sender_mode === 'speaker_producer' ? 'speaker_producer' : 'me') as 'me' | 'speaker_producer', confirmed: !!b.confirmed,
    templateId: typeof b.template_id === 'string' && UUID.test(b.template_id) ? b.template_id : null, fieldValues: (b.field_values && typeof b.field_values === 'object' ? b.field_values : {}) as Record<string, unknown>,
    draftId: typeof b.draft_id === 'string' && UUID.test(b.draft_id) ? b.draft_id : null,
  }
  const audience: AudienceInput = {}
  if (typeof b.send_at_local === 'string' && b.send_at_local) {
    const sr = await createScheduledCampaign(session, { ...common, audience, sendAtLocal: b.send_at_local, ownerStaffId: typeof b.owner_staff_id === 'string' && UUID.test(b.owner_staff_id) ? b.owner_staff_id : null, rememberOwner: !!b.remember_owner })
    if (!sr.ok) return NextResponse.json({ error: sr.error, errors: sr.errors, needs_confirmation: sr.needs_confirmation, recipients: sr.recipients }, { status: sr.status })
    if (common.draftId) await supabaseAdmin.from('email_campaigns').delete().eq('id', common.draftId).eq('status', 'draft')
    return NextResponse.json({ campaign_id: sr.campaign_id, count: sr.count, scheduled: true, released: sr.released, waiting_for: sr.waiting_for })
  }
  const r = await createCampaign(session, { ...common, audience, paceHours: typeof b.pace_hours === 'number' && b.pace_hours >= 1 ? Math.min(72, Math.floor(b.pace_hours)) : null, skipUnpersonalisable: !!b.skip_unpersonalisable })
  if (!r.ok) return NextResponse.json({ error: r.error, errors: r.errors, needs_confirmation: r.needs_confirmation, recipients: r.recipients, unpersonalisable: r.unpersonalisable }, { status: r.status })
  return NextResponse.json({ campaign_id: r.campaign_id, count: r.count, warnings: r.warnings, paced: r.paced })
}
