import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { resolveScope, scopeFromParams } from '@/app/lib/ops/scope'
import { hasSectionAccess, staffForSection } from '@/app/lib/ops/section-access'
import { loadSpeakerDocRows, REMIND_COOLDOWN_HOURS } from '@/app/lib/ops/speaker-documents'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/operations/speakers?event_id= | ?umbrella_id=
   Confirmed speakers of the scope's events (an umbrella lists all its children) with Passport / National ID STATUS only.
   Gate: admin, ops.speakers.view, or assigned to Speaker Doc Request. Also says who reminders will be sent as per event. */
export async function GET(req: NextRequest) {
  const scope = await resolveScope(scopeFromParams(req.nextUrl.searchParams))
  if (!scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })
  const session = getSession(req)
  // The Speaker Licences team sees the same status board (a tab on their page); reminders stay with Speaker Doc Request.
  if (!(await hasSectionAccess(session, scope, 'speakers')) && !(await hasSectionAccess(session, scope, 'licenses'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const [rows, senders] = await Promise.all([
    loadSpeakerDocRows(scope.eventIds),
    Promise.all(scope.eventIds.map(async id => [id, await staffForSection(id, 'speakers')] as const)),
  ])
  const { data: evs } = scope.eventIds.length ? await supabaseAdmin.from('events').select('id, name').in('id', scope.eventIds) : { data: [] }
  return NextResponse.json({
    scope: { kind: scope.kind, id: scope.id, name: scope.name },
    cooldown_hours: REMIND_COOLDOWN_HOURS,
    events: (evs ?? []).map(e => ({ id: e.id, name: e.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    // Who reminders go out as, per event: the assigned Ops person(s), or null → shared noreply.
    senders: Object.fromEntries(senders.map(([id, s]) => [id, s.assigned ? s.staff.map(x => x.name) : null])),
    rows,
  })
}
