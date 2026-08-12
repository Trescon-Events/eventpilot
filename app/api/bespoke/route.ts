/**
 * Bespoke Tracker API
 * GET  — list all bespoke projects (with staff names)
 * POST — create new bespoke project + auto-create event + auto-generate tasks
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { buildTasksForProject, calculateDueDate } from '@/app/lib/bespoke/task-templates'

// Task templates + interpolateTitle + calculateDueDate + buildTasksForProject
// live in app/lib/bespoke/task-templates.ts (extracted 2026-08-12 so the
// retroactive re-seed route — Nic 09390aeb — shares the exact same
// 43-task blueprint as this create-project POST).

// ── GET ─────────────────────────────────────────────────────────
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('bespoke_projects')
    .select(`
      *,
      commercial_lead:commercial_lead_id ( id, name ),
      marketing_lead:marketing_lead_id ( id, name ),
      delegate_lead:delegate_lead_id ( id, name ),
      operations_lead:operations_lead_id ( id, name ),
      design_lead:design_lead_id ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get delegate counts per project
  const projectIds = (data ?? []).map(p => p.id)
  let delegateCounts: Record<string, { total: number; registered: number; attended: number }> = {}

  if (projectIds.length > 0) {
    const { data: delegates } = await supabaseAdmin
      .from('bespoke_delegates')
      .select('project_id, stage')
      .in('project_id', projectIds)

    if (delegates) {
      for (const d of delegates) {
        if (!delegateCounts[d.project_id]) delegateCounts[d.project_id] = { total: 0, registered: 0, attended: 0 }
        delegateCounts[d.project_id].total++
        if (['registered', 'confirmed', 'attended'].includes(d.stage)) delegateCounts[d.project_id].registered++
        if (d.stage === 'attended') delegateCounts[d.project_id].attended++
      }
    }
  }

  const enriched = (data ?? []).map(p => ({
    ...p,
    delegate_stats: delegateCounts[p.id] ?? { total: 0, registered: 0, attended: 0 },
  }))

  return NextResponse.json(enriched)
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()

  // 1. Auto-create event record. Column names must match the events table —
  // it has name/event_date/city, not title/start_date/location. `format`
  // lives on bespoke_projects (inserted below), not on events at all.
  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .insert({
      name:       body.title,
      type:       'bespoke',
      status:     'planning',
      event_date: body.event_date,
      city:       body.city  || null,
      venue:      body.venue || null,
    })
    .select('id')
    .single()

  if (eventErr) return NextResponse.json({ error: 'Failed to create event: ' + eventErr.message }, { status: 500 })

  // 2. Create bespoke project
  const { data: project, error: projErr } = await supabaseAdmin
    .from('bespoke_projects')
    .insert({
      event_id: event.id,
      client_company: body.client_company,
      client_contact_name: body.client_contact_name || null,
      client_contact_email: body.client_contact_email || null,
      client_contact_phone: body.client_contact_phone || null,
      contract_value: body.contract_value || 0,
      contract_signed_date: body.contract_signed_date || null,
      title: body.title,
      format: body.format || 'physical',
      event_date: body.event_date,
      event_time: body.event_time || null,
      city: body.city || null,
      venue: body.venue || null,
      target_delegate_count: body.target_delegate_count || 25,
      target_delegate_profile: body.target_delegate_profile || null,
      commercial_lead_id: body.commercial_lead_id || null,
      marketing_lead_id: body.marketing_lead_id || null,
      delegate_lead_id: body.delegate_lead_id || null,
      operations_lead_id: body.operations_lead_id || null,
      design_lead_id: body.design_lead_id || null,
      production_advisor_id: body.production_advisor_id || null,
      // New wizard fields (webinar + brand assets + manual lead fallbacks)
      webinar_platform: body.webinar_platform || null,
      webinar_link: body.webinar_link || null,
      client_assets_url: body.client_assets_url || null,
      commercial_lead_manual: body.commercial_lead_manual || null,
      marketing_lead_manual: body.marketing_lead_manual || null,
      delegate_lead_manual: body.delegate_lead_manual || null,
      operations_lead_manual: body.operations_lead_manual || null,
      created_by: body.created_by || null,
      // Nic 2f002c2e — creator_id drives edit/delete permissions on the
      // Tasks tab. Falls back to body.created_by so a project retains the
      // creator identity even when session isn't available at POST time.
      creator_id: body.creator_id || body.created_by || null,
    })
    .select('id')
    .single()

  if (projErr) return NextResponse.json({ error: 'Failed to create project: ' + projErr.message }, { status: 500 })

  // 3. Auto-generate tasks from the shared 43-task blueprint.
  // buildTasksForProject handles format filtering, {{client}}/{{venue}}
  // interpolation, role→lead mapping and runway-proportional due dates.
  const tasks = buildTasksForProject({
    id:                    project.id,
    client_company:        body.client_company,
    venue:                 body.venue,
    city:                  body.city,
    format:                (body.format ?? 'physical') as 'physical' | 'virtual' | 'hybrid',
    contract_signed_date:  body.contract_signed_date,
    event_date:            body.event_date,
    commercial_lead_id:    body.commercial_lead_id,
    marketing_lead_id:     body.marketing_lead_id,
    delegate_lead_id:      body.delegate_lead_id,
    operations_lead_id:    body.operations_lead_id,
    design_lead_id:        body.design_lead_id,
    production_advisor_id: body.production_advisor_id,
  })

  // Insert tasks and RETURN the actual inserted rows so we know how many
  // landed, not just how many we intended to send. Previously we only
  // console.error'd on failure and returned tasks_created: tasks.length,
  // which produced silent 0/0-task projects when the insert failed — a
  // Nic reported this on 14 Jul.
  const { data: insertedTasks, error: taskErr } = await supabaseAdmin
    .from('bespoke_tasks')
    .insert(tasks)
    .select('id')

  if (taskErr) {
    console.error('Task generation error:', taskErr.message)
    return NextResponse.json(
      {
        id: project.id,
        event_id: event.id,
        tasks_created: 0,
        task_seed_error: taskErr.message,
        warning: 'Project created but SOP task auto-seed failed — tasks tab will be empty. Please add tasks manually or contact the admin.',
      },
      { status: 207 }, // Multi-Status: project OK, tasks failed
    )
  }

  return NextResponse.json(
    { id: project.id, event_id: event.id, tasks_created: insertedTasks?.length ?? 0 },
    { status: 201 },
  )
}

// ── PATCH ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Detect whether this update touches a scheduling field. If so, we
  // recompute every task's due_date after the project update lands.
  const touchesSchedule =
    'contract_signed_date' in updates ||
    'event_date' in updates ||
    'format' in updates

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('bespoke_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-recalc task due_dates whenever scheduling inputs change.
  // Wrapped so a recompute failure never blocks the PATCH response.
  if (touchesSchedule) {
    try {
      const newContractSignedDate = data?.contract_signed_date ?? null
      const newEventDate = data?.event_date ?? null

      const { data: projectTasks, error: taskLoadErr } = await supabaseAdmin
        .from('bespoke_tasks')
        .select('id, phase, week_number')
        .eq('project_id', id)

      if (taskLoadErr) {
        console.error('PATCH recalc: failed to load tasks:', taskLoadErr.message)
      } else if (projectTasks && projectTasks.length > 0) {
        for (const t of projectTasks) {
          const newDue = calculateDueDate(newContractSignedDate, newEventDate, t.phase, t.week_number)
          const { error: updErr } = await supabaseAdmin
            .from('bespoke_tasks')
            .update({ due_date: newDue })
            .eq('id', t.id)
          if (updErr) console.error(`PATCH recalc: failed to update task ${t.id}:`, updErr.message)
        }
      }
    } catch (e) {
      console.error('PATCH recalc: unexpected error:', e)
    }
  }

  return NextResponse.json(data)
}
