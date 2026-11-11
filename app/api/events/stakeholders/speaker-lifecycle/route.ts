import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { strictEventDays, eventEnded } from '@/app/lib/events/event-days'
import { loadSpeakerStats, postEventCandidates, applyPostEventOutcomes, classifyDeleted, type ClassifyOutcome } from '@/app/lib/speaker-lifecycle/server'

/* Speaker lifecycle API (2026-11-10).
   GET  ?event_id=…&scope=event|umbrella — speaker statistics, whether the event is over, and the confirmed speakers the post-event banner offers to mark Spoke.
   POST { action: 'post_event', event_id, outcomes: [{ id, to: 'Spoke' | 'No-show' }] }   — the post-event banner (one action, many speakers).
   POST { action: 'classify', event_id, speaker_id, outcome: 'withdrew'|'test'|'duplicate'|'mistake', reason?, note? } — says what an old deleted record really was.
   Any producer on the event may do this (sae.stakeholders.edit), as may an admin. Status changes made one speaker at a time go through the speaker's own PATCH. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit')) && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  const { data: ev } = await supabaseAdmin.from('events').select('id, name, umbrella_id, timezone, actual_start_date, actual_end_date').eq('id', eventId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  let ids = [eventId]
  if (req.nextUrl.searchParams.get('scope') === 'umbrella' && ev.umbrella_id) {
    const { data: sibs } = await supabaseAdmin.from('events').select('id').eq('umbrella_id', ev.umbrella_id)
    ids = (sibs ?? []).map(e => e.id as string)
  }
  const [stats, candidates] = await Promise.all([loadSpeakerStats(ids), postEventCandidates(eventId)])
  // Only the real event days decide this (never the project dates, which can run for months), in the event's own timezone. No event days → nothing is offered and the page asks for them.
  const days = strictEventDays(ev as { actual_start_date: string | null; actual_end_date: string | null })
  const ended = eventEnded(days.end, new Date(), ev.timezone as string | null)
  return NextResponse.json({ event: { id: ev.id, name: ev.name, has_umbrella: !!ev.umbrella_id }, scope_events: ids.length, ended, days_missing: !days.start, stats, candidates: ended ? candidates : [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { action?: string; event_id?: string; outcomes?: { id: string; to: string }[]; speaker_id?: string; outcome?: string; reason?: unknown; note?: unknown } | null
  if (!body || !body.event_id || !UUID.test(body.event_id)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, body.event_id, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const by = session.sid ?? null

  if (body.action === 'post_event') {
    const outcomes = (body.outcomes ?? []).filter((o): o is { id: string; to: 'Spoke' | 'No-show' } => UUID.test(o?.id ?? '') && (o.to === 'Spoke' || o.to === 'No-show'))
    if (!outcomes.length) return NextResponse.json({ error: 'Nothing selected.' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await applyPostEventOutcomes(body.event_id, outcomes, by)) })
  }
  if (body.action === 'classify') {
    if (!UUID.test(body.speaker_id ?? '') || !['withdrew', 'test', 'duplicate', 'mistake'].includes(body.outcome ?? '')) return NextResponse.json({ error: 'speaker_id and a valid outcome are required.' }, { status: 400 })
    const r = await classifyDeleted(body.event_id, body.speaker_id!, body.outcome as ClassifyOutcome, body.reason, body.note, by)
    return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
