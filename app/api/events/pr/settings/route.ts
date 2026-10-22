import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requirePrAccess } from '@/app/lib/pr/access'
import { loadMediaDays, loadSettings, prContactsFor, suggestMediaDays, eventTimezone } from '@/app/lib/pr/media-interest'
import { toMinutes } from '@/app/lib/pr/windows'
import { notifyStaff } from '@/app/lib/notify'

/* GET ?event_id= — PR contacts, candidates (the event's roster), saved media days, a suggestion, intro.
   PUT { event_id, contact_ids?: string[], days?: [{day, open, close}], intro?: string, confirm_days?: boolean } — manage only. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const auth = await requirePrAccess(req, eventId, 'view'); if ('error' in auth) return auth.error
  const [{ contacts, assigned }, days, settings, suggestion, tz, roster] = await Promise.all([
    prContactsFor(eventId), loadMediaDays(eventId), loadSettings(eventId), suggestMediaDays(eventId), eventTimezone(eventId),
    supabaseAdmin.from('event_staff').select('staff:staff_members!staff_id(id, name, email, role)').eq('event_id', eventId),
  ])
  const seen = new Set<string>()
  const candidates = (roster.data ?? []).map(r => (Array.isArray(r.staff) ? r.staff[0] : r.staff) as { id: string; name: string; email: string; role: string | null } | null)
    .filter((s): s is { id: string; name: string; email: string; role: string | null } => !!s && !seen.has(s.id) && !!seen.add(s.id))
  return NextResponse.json({ contacts, contacts_assigned: assigned, candidates, days, suggestion, intro: settings.intro, days_confirmed_at: settings.days_confirmed_at, timezone: tz })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; contact_ids?: string[]; days?: { day?: string; open?: string; close?: string; slot?: number }[]; intro?: string; confirm_days?: boolean } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const eventId = body.event_id
  const auth = await requirePrAccess(req, eventId, 'manage'); if ('error' in auth) return auth.error
  const sid = auth.session.sid && auth.session.sid !== 'super-admin' ? auth.session.sid : null

  if (Array.isArray(body.contact_ids)) {
    const ids = [...new Set(body.contact_ids)]
    if (ids.length > 2) return NextResponse.json({ error: 'Choose at most two PR contacts.' }, { status: 400 })
    const { data: roster } = await supabaseAdmin.from('event_staff').select('staff_id').eq('event_id', eventId).in('staff_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    const onRoster = new Set((roster ?? []).map(r => r.staff_id as string))
    if (ids.some(i => !onRoster.has(i))) return NextResponse.json({ error: 'A PR contact must be on this event’s staff list.' }, { status: 400 })
    const { data: before } = await supabaseAdmin.from('event_pr_contacts').select('staff_id').eq('event_id', eventId)
    const had = new Set((before ?? []).map(r => r.staff_id as string))
    await supabaseAdmin.from('event_pr_contacts').delete().eq('event_id', eventId)
    if (ids.length) await supabaseAdmin.from('event_pr_contacts').insert(ids.map(staff_id => ({ event_id: eventId, staff_id, assigned_by: sid })))
    const added = ids.filter(i => !had.has(i))
    if (added.length) {
      const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', eventId).maybeSingle()
      await notifyStaff(added, { type: 'pr_contact_assigned', title: `You are the PR contact for ${ev?.name ?? 'an event'}`, body: 'Speakers who are open to media interviews will be sent to you in PR & Media.', link: `/admin/events/${eventId}/pr-media`, eventId })
    }
  }

  if (Array.isArray(body.days)) {
    const rows = body.days.map(d => ({ event_id: eventId, day: String(d.day ?? ''), open_time: String(d.open ?? ''), close_time: String(d.close ?? ''), slot_minutes: d.slot === 30 ? 30 : 60 }))
    for (const r of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day) || !(toMinutes(r.open_time) >= 0) || !(toMinutes(r.close_time) > toMinutes(r.open_time))) return NextResponse.json({ error: 'Each day needs a date and an opening time before its closing time.' }, { status: 400 })
    }
    if (new Set(rows.map(r => r.day)).size !== rows.length) return NextResponse.json({ error: 'A day is listed twice.' }, { status: 400 })
    if (rows.length > 14) return NextResponse.json({ error: 'At most 14 days.' }, { status: 400 })
    await supabaseAdmin.from('event_media_days').delete().eq('event_id', eventId)
    if (rows.length) await supabaseAdmin.from('event_media_days').insert(rows)
    // Changing the days un-confirms them: PR re-confirms before anyone is asked.
    await supabaseAdmin.from('event_pr_settings').upsert({ event_id: eventId, days_confirmed_at: null, updated_by: sid, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  }

  const patch: Record<string, unknown> = { event_id: eventId, updated_by: sid, updated_at: new Date().toISOString() }
  if (typeof body.intro === 'string') patch.intro = body.intro.trim().slice(0, 600) || null
  if (body.confirm_days) {
    const days = await loadMediaDays(eventId)
    if (!days.length) return NextResponse.json({ error: 'Add at least one media day first.' }, { status: 422 })
    patch.days_confirmed_at = new Date().toISOString()
  }
  if (Object.keys(patch).length > 3) await supabaseAdmin.from('event_pr_settings').upsert(patch, { onConflict: 'event_id' })
  return NextResponse.json({ ok: true })
}
