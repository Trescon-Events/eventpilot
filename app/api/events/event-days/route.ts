import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission, hasPlatformPermission } from '@/app/lib/access/event-access'
import { resolveScope, hasScopePermission } from '@/app/lib/ops/scope'
import { computeRetention, planRetentionUpdate, applyRetentionUpdate } from '@/app/lib/events/sensitive-retention'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* Real "Event days" (2026-09-25) — actual_start_date / actual_end_date on an EVENT or an UMBRELLA.
   These are NOT events.event_date / end_date (the whole planning cycle) and not the public
   text dates; they drive when Passport / National ID documents are deleted (see
   app/lib/events/sensitive-retention.ts).

   GET /api/events/event-days?event_id=X | umbrella_id=X
       Dates + how deletion is currently being scheduled (and a warning basis when unset).
   PUT /api/events/event-days   Body: { event_id | umbrella_id, actual_start_date, actual_end_date, confirm_past?: boolean }
       Saves the dates and re-stamps the deletion date of documents already on file. If that would
       put existing documents' deletion date in the PAST (deleted at the next daily run — permanent),
       nothing is saved unless confirm_past is true. Events use their own days (never lifted to the
       umbrella); an event under an umbrella also inherits the umbrella's later last day. */

const ISO = /^\d{4}-\d{2}-\d{2}$/
const validDate = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(new Date(v).getTime()) && new Date(v).toISOString().slice(0, 10) === v
const dateOnly = (iso: string) => iso.slice(0, 10)

async function target(input: { event_id?: string | null; umbrella_id?: string | null }) {
  const scope = await resolveScope({ eventId: input.event_id ?? null, umbrellaId: input.umbrella_id ?? null }, { exact: true })
  return scope
}

export async function GET(req: NextRequest) {
  const scope = await target({ event_id: req.nextUrl.searchParams.get('event_id'), umbrella_id: req.nextUrl.searchParams.get('umbrella_id') })
  if (!scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })
  const session = getSession(req)
  const canSee = scope.kind === 'event'
    ? !!session?.adm || (await hasEventPermission(session?.sid, scope.id, 'sae.stakeholders.view')) || (await hasEventPermission(session?.sid, scope.id, 'ops.view')) || (await hasEventPermission(session?.sid, scope.id, 'sae.sensitive_documents.view'))
    : (await hasScopePermission(session, scope, 'ops.view')) || (await hasScopePermission(session, scope, 'sae.stakeholders.view'))
  if (!canSee) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const noStore = { 'Cache-Control': 'no-store' }
  if (scope.kind === 'umbrella') {
    const { data: u } = await supabaseAdmin.from('event_umbrellas').select('actual_start_date, actual_end_date, event_date, end_date').eq('id', scope.id).single()
    const plan = await planRetentionUpdate(scope.eventIds)
    const { data: kids } = await supabaseAdmin.from('events').select('id, name, actual_start_date, actual_end_date').in('id', scope.eventIds)
    return NextResponse.json({
      kind: 'umbrella', id: scope.id, name: scope.name,
      actual_start_date: u?.actual_start_date ?? null, actual_end_date: u?.actual_end_date ?? null, cycle_start: u?.event_date ?? null, cycle_end: u?.end_date ?? null,
      documents: plan.totalDocs,
      children: plan.perEvent.map(p => {
        const k = kids?.find(x => x.id === p.eventId)
        return { id: p.eventId, name: k?.name ?? '', actual_start_date: k?.actual_start_date ?? null, actual_end_date: k?.actual_end_date ?? null, basis: p.calc.basis, delete_on: dateOnly(p.calc.expiresAt), documents: p.docs }
      }),
    }, { headers: noStore })
  }

  const { data: e } = await supabaseAdmin.from('events').select('actual_start_date, actual_end_date, event_date, end_date, public_dates_display, umbrella_id').eq('id', scope.id).single()
  const calc = await computeRetention(scope.id)
  const { count } = await supabaseAdmin.from('speaker_sensitive_documents').select('*', { count: 'exact', head: true }).eq('event_id', scope.id).is('deleted_at', null)
  let umbrella: { id: string; name: string; actual_end_date: string | null } | null = null
  if (e?.umbrella_id) {
    const { data: u } = await supabaseAdmin.from('event_umbrellas').select('id, name, actual_end_date').eq('id', e.umbrella_id).single()
    umbrella = u ?? null
  }
  return NextResponse.json({
    kind: 'event', id: scope.id, name: scope.name,
    actual_start_date: e?.actual_start_date ?? null, actual_end_date: e?.actual_end_date ?? null, cycle_start: e?.event_date ?? null, cycle_end: e?.end_date ?? null,
    public_dates_text: e?.public_dates_display ?? null, umbrella,
    retention: { basis: calc.basis, base_date: calc.baseDate, delete_on: dateOnly(calc.expiresAt), days: calc.retentionDays, documents: count ?? 0 },
  }, { headers: noStore })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; umbrella_id?: string; actual_start_date?: string | null; actual_end_date?: string | null; confirm_past?: boolean } | null
  const scope = body ? await target(body) : null
  if (!body || !scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })

  const start = body.actual_start_date || null, end = body.actual_end_date || null
  if ((start && !validDate(start)) || (end && !validDate(end))) return NextResponse.json({ error: 'Dates must be real calendar dates (YYYY-MM-DD).' }, { status: 400 })
  if (start && end && end < start) return NextResponse.json({ error: 'The last day cannot be before the first day.' }, { status: 400 })

  const session = getSession(req)
  const allowed = scope.kind === 'event'
    ? !!session?.adm || (await hasEventPermission(session?.sid, scope.id, 'sae.forms.manage')) || (await hasEventPermission(session?.sid, scope.id, 'ops.event_days.manage'))
    : (await hasScopePermission(session, scope, 'ops.event_days.manage')) || (await hasPlatformPermission(session?.sid, 'sae.messaging.umbrella_manage'))
  if (!allowed) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  // What would the new dates do to documents already on file?
  const override = scope.kind === 'umbrella' ? { umbrellaEnd: end } : { eventEnd: end }
  const plan = await planRetentionUpdate(scope.eventIds, override)
  if (plan.pastDue > 0 && !body.confirm_past) {
    return NextResponse.json({
      error: `These dates would delete ${plan.pastDue} document${plan.pastDue === 1 ? '' : 's'} at the next daily clean-up, because the deletion date would already have passed. Deletion is permanent.`,
      needs_confirmation: true, would_delete_now: plan.pastDue, documents: plan.totalDocs,
    }, { status: 409 })
  }

  const table = scope.kind === 'umbrella' ? 'event_umbrellas' : 'events'
  const { error } = await supabaseAdmin.from(table).update({ actual_start_date: start, actual_end_date: end }).eq('id', scope.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const updatedDocs = await applyRetentionUpdate(scope.eventIds)
  await logOpsAccess({
    eventId: scope.kind === 'event' ? scope.id : null, umbrellaId: scope.kind === 'umbrella' ? scope.id : null,
    actorType: 'staff', actorId: session?.sid ?? null, action: 'event_days_changed', targetType: scope.kind,
    targetId: scope.id, meta: { start, end, documents_restamped: updatedDocs, confirmed_past: !!body.confirm_past && plan.pastDue > 0, past_due: plan.pastDue }, ip: clientIp(req),
  })
  return NextResponse.json({ ok: true, documents_updated: updatedDocs })
}
