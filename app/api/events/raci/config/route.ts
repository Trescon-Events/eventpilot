import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET   /api/events/raci/config?event_id=uuid  — get COO cycle config
  POST  /api/events/raci/config                — create or update config + recalculate dates
*/

function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

function subtractDays(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() - days)
  return d
}

function toDateStr(d: Date) { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_raci_config')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { event_id, total_cycle_days, cycle_start_date, configured_by, override_log } = body ?? {}

  if (!event_id || !total_cycle_days || !cycle_start_date) {
    return NextResponse.json({ error: 'event_id, total_cycle_days, cycle_start_date required' }, { status: 400 })
  }

  // Upsert config
  const { data: config, error: cfgErr } = await supabaseAdmin
    .from('event_raci_config')
    .upsert({
      event_id,
      total_cycle_days,
      cycle_start_date,
      configured_by: configured_by ?? null,
      configured_at: new Date().toISOString(),
      override_log:  override_log ?? [],
    }, { onConflict: 'event_id' })
    .select()
    .single()

  if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 })

  // Fetch event date for pre-event window calculations
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('event_date')
    .eq('id', event_id)
    .single()

  const eventDate  = event?.event_date ? new Date(event.event_date) : null
  const cycleStart = new Date(cycle_start_date)
  const cycleDays  = total_cycle_days

  // Check if checkpoints exist for this event
  const { data: checkpoints } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .select('id, timeline_type, default_duration_days, default_pre_event_days, cycle_track, cycle_milestone_pct, master_id')
    .eq('event_id', event_id)

  if (!checkpoints || checkpoints.length === 0) {
    // Seed checkpoints from master
    const { data: master } = await supabaseAdmin
      .from('event_raci_master')
      .select('*')
      .order('phase')
      .order('sort_order')

    if (master?.length) {
      const toInsert = master.map(m => {
        let dueDate: string | null = null
        if (m.timeline_type === 'fixed_duration') {
          dueDate = toDateStr(addWorkingDays(cycleStart, m.default_duration_days ?? 1))
        } else if (m.timeline_type === 'fixed_pre_event' && eventDate) {
          dueDate = toDateStr(subtractDays(eventDate, m.default_pre_event_days ?? 7))
        } else if (m.timeline_type === 'cycle_dependent' && m.cycle_milestone_pct) {
          const daysIn = Math.round((cycleDays * m.cycle_milestone_pct) / 100)
          const d = new Date(cycleStart)
          d.setDate(d.getDate() + daysIn)
          dueDate = toDateStr(d)
        }
        return {
          event_id, master_id: m.id, phase: m.phase, phase_name: m.phase_name,
          name: m.name, timeline_type: m.timeline_type,
          cycle_track: m.cycle_track, cycle_milestone_pct: m.cycle_milestone_pct,
          cycle_phase_label: m.cycle_phase_label,
          responsible_roles: m.responsible_roles, accountable_roles: m.accountable_roles,
          consulted_roles: m.consulted_roles, informed_roles: m.informed_roles,
          approval_required: m.approval_required, approver_roles: m.approver_roles,
          depends_on_names: m.depends_on_names,
          due_date: dueDate, status: 'not_started', sort_order: m.sort_order,
        }
      })
      await supabaseAdmin.from('event_raci_checkpoints').insert(toInsert)
    }
  } else {
    // Recalculate due dates for non-overridden checkpoints
    // First find which checkpoints have been manually overridden
    const { data: overrides } = await supabaseAdmin
      .from('event_raci_overrides')
      .select('checkpoint_id, field_overridden')
      .eq('event_id', event_id)
      .eq('field_overridden', 'due_date')

    const overriddenIds = new Set((overrides ?? []).map(o => o.checkpoint_id))

    // Fetch master data for recalculation
    const { data: master } = await supabaseAdmin
      .from('event_raci_master')
      .select('id, timeline_type, default_duration_days, default_pre_event_days, cycle_milestone_pct')

    const masterMap: Record<string, typeof master extends (infer T)[] | null ? T : never> = {}
    ;(master ?? []).forEach(m => { masterMap[m.id] = m })

    for (const cp of checkpoints) {
      if (overriddenIds.has(cp.id) || !cp.master_id) continue

      const m = masterMap[cp.master_id]
      if (!m) continue

      let dueDate: string | null = null
      if (m.timeline_type === 'fixed_duration') {
        dueDate = toDateStr(addWorkingDays(cycleStart, m.default_duration_days ?? 1))
      } else if (m.timeline_type === 'fixed_pre_event' && eventDate) {
        dueDate = toDateStr(subtractDays(eventDate, m.default_pre_event_days ?? 7))
      } else if (m.timeline_type === 'cycle_dependent' && m.cycle_milestone_pct) {
        const daysIn = Math.round((cycleDays * m.cycle_milestone_pct) / 100)
        const d = new Date(cycleStart)
        d.setDate(d.getDate() + daysIn)
        dueDate = toDateStr(d)
      }

      if (dueDate) {
        await supabaseAdmin
          .from('event_raci_checkpoints')
          .update({ due_date: dueDate, updated_at: new Date().toISOString() })
          .eq('id', cp.id)
      }
    }
  }

  return NextResponse.json({ success: true, config })
}
