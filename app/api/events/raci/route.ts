import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET   /api/events/raci?event_id=uuid        — fetch all checkpoints (with latest approval)
  POST  /api/events/raci                      — seed checkpoints from master template
  PATCH /api/events/raci?id=uuid              — update a checkpoint (status, notes, completed_by)
  DELETE /api/events/raci?event_id=uuid       — re-seed (wipe + reseed) for an event
*/

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: checkpoints, error } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .select('*')
    .eq('event_id', eventId)
    .order('phase')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate by master_id — keep earliest sort_order occurrence
  const seenMaster = new Set<string>()
  const deduped = (checkpoints ?? []).filter(c => {
    if (seenMaster.has(c.master_id)) return false
    seenMaster.add(c.master_id)
    return true
  })

  // Fetch duration data from master template
  const masterIds = deduped.map(c => c.master_id)
  const masterMap: Record<string, { default_duration_days: number | null; default_pre_event_days: number | null }> = {}
  if (masterIds.length) {
    const { data: masterRows } = await supabaseAdmin
      .from('event_raci_master')
      .select('id, default_duration_days, default_pre_event_days')
      .in('id', masterIds)
    ;(masterRows ?? []).forEach(m => { masterMap[m.id] = m })
  }

  // Attach latest approval per checkpoint
  const ids = deduped.map(c => c.id)
  let approvalMap: Record<string, object> = {}
  if (ids.length) {
    const { data: approvals } = await supabaseAdmin
      .from('event_raci_approvals')
      .select('*')
      .in('checkpoint_id', ids)
      .order('version', { ascending: false })

    ;(approvals ?? []).forEach(a => {
      if (!approvalMap[a.checkpoint_id]) approvalMap[a.checkpoint_id] = a
    })
  }

  // Attach overrides per checkpoint
  let overrideMap: Record<string, object[]> = {}
  if (ids.length) {
    const { data: overrides } = await supabaseAdmin
      .from('event_raci_overrides')
      .select('*')
      .in('checkpoint_id', ids)
      .order('overridden_at', { ascending: false })

    ;(overrides ?? []).forEach(o => {
      if (!overrideMap[o.checkpoint_id]) overrideMap[o.checkpoint_id] = []
      overrideMap[o.checkpoint_id].push(o)
    })
  }

  const enriched = deduped.map(c => ({
    ...c,
    default_duration_days:   masterMap[c.master_id]?.default_duration_days   ?? null,
    default_pre_event_days:  masterMap[c.master_id]?.default_pre_event_days  ?? null,
    latest_approval: approvalMap[c.id] ?? null,
    overrides: overrideMap[c.id] ?? [],
  }))

  const today = new Date().toISOString().slice(0, 10)
  const redFlags = enriched.filter(c =>
    (c.due_date && c.due_date < today && !['complete','approved','rejected'].includes(c.status)) ||
    c.status === 'overdue'
  )

  return NextResponse.json({ checkpoints: enriched, red_flag_count: redFlags.length })
}

// ── POST — Seed from master template ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const eventId = body.event_id
  const reseed  = !!body.reseed

  // Check if already seeded
  const { count } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  if ((count ?? 0) > 0 && !reseed) {
    return NextResponse.json({ error: 'Already seeded. Pass reseed:true to replace.' }, { status: 409 })
  }

  if (reseed) {
    await supabaseAdmin.from('event_raci_checkpoints').delete().eq('event_id', eventId)
  }

  // Fetch event for date info
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('event_date')
    .eq('id', eventId)
    .single()

  // Fetch COO config (may not exist yet — dates will be null until configured)
  const { data: config } = await supabaseAdmin
    .from('event_raci_config')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  // Fetch master
  const { data: master, error: mErr } = await supabaseAdmin
    .from('event_raci_master')
    .select('*')
    .order('phase')
    .order('sort_order')

  if (mErr || !master) return NextResponse.json({ error: 'Master template not found' }, { status: 500 })

  const eventDate    = event?.event_date ? new Date(event.event_date) : null
  const cycleStart   = config?.cycle_start_date ? new Date(config.cycle_start_date) : null
  const cycleDays    = config?.total_cycle_days ?? null

  // Calculate due dates
  const toInsert = master.map(m => {
    let dueDate: string | null = null

    if (m.timeline_type === 'fixed_duration' && cycleStart) {
      dueDate = toDateStr(addWorkingDays(cycleStart, m.default_duration_days ?? 1))
    } else if (m.timeline_type === 'fixed_pre_event' && eventDate && m.default_pre_event_days) {
      dueDate = toDateStr(subtractDays(eventDate, m.default_pre_event_days))
    } else if (m.timeline_type === 'cycle_dependent' && cycleStart && cycleDays && m.cycle_milestone_pct) {
      const daysIn = Math.round((cycleDays * m.cycle_milestone_pct) / 100)
      const d = new Date(cycleStart)
      d.setDate(d.getDate() + daysIn)
      dueDate = toDateStr(d)
    }
    // Phase-based cycle items (no milestone_pct): due date set manually or by config overrides

    return {
      event_id:            eventId,
      master_id:           m.id,
      phase:               m.phase,
      phase_name:          m.phase_name,
      name:                m.name,
      timeline_type:       m.timeline_type,
      cycle_track:         m.cycle_track,
      cycle_milestone_pct: m.cycle_milestone_pct,
      cycle_phase_label:   m.cycle_phase_label,
      responsible_roles:   m.responsible_roles,
      accountable_roles:   m.accountable_roles,
      consulted_roles:     m.consulted_roles,
      informed_roles:      m.informed_roles,
      approval_required:   m.approval_required,
      approver_roles:      m.approver_roles,
      depends_on_names:    m.depends_on_names,
      due_date:            dueDate,
      status:              'not_started',
      sort_order:          m.sort_order,
    }
  })

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .insert(toInsert)
    .select()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: inserted?.length ?? 0 })
}

// ── PATCH — Update a checkpoint ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  // Fetch current state for re-approval check
  const { data: current } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .select('*')
    .eq('id', id)
    .single()

  const update: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() }

  // Auto-set completed_at
  if (body.status === 'complete' || body.status === 'pending_approval') {
    if (!update.completed_at) update.completed_at = new Date().toISOString()
  } else if (body.status === 'not_started' || body.status === 'in_progress') {
    update.completed_at = null
  }

  // If checkpoint had been approved and is now being materially changed → re-approval
  const MATERIAL_FIELDS = ['completion_notes']
  const isMaterialChange = current?.status === 'approved' &&
    MATERIAL_FIELDS.some(f => body[f] !== undefined && body[f] !== current[f])

  if (isMaterialChange) {
    update.status = 'pending_approval'

    // Log history
    for (const f of MATERIAL_FIELDS) {
      if (body[f] !== undefined && body[f] !== current[f]) {
        await supabaseAdmin.from('event_raci_history').insert({
          checkpoint_id:        id,
          event_id:             current.event_id,
          field_changed:        f,
          old_value:            String(current[f] ?? ''),
          new_value:            String(body[f] ?? ''),
          triggered_reapproval: true,
        })
      }
    }

    // Mark existing approval as superseded by invalidating it
    await supabaseAdmin
      .from('event_raci_approvals')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null, review_note: 'Re-approval required after material change' })
      .eq('checkpoint_id', id)
      .eq('status', 'approved')
  }

  const { data, error } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE — Re-seed (clears + reseeds) ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  await supabaseAdmin.from('event_raci_checkpoints').delete().eq('event_id', eventId)
  return NextResponse.json({ success: true })
}
