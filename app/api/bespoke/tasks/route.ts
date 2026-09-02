/**
 * Bespoke Tasks API
 * GET    ?project_id=X — list all tasks for a project
 * PATCH                — update task status/notes/title (project creator or admin)
 * POST                 — create custom task
 * DELETE ?id=X         — delete task (project creator or admin only, Nic e606f19c)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

/** Returns true when the current session may mutate tasks on this project.
 *  Admin OR the project's creator OR any assigned team lead. */
async function canMutateTasks(req: NextRequest, projectId: string): Promise<boolean> {
  const session = getSession(req)
  if (!session) return false
  if (session.adm) return true
  const { data: p } = await supabaseAdmin
    .from('bespoke_projects')
    .select('created_by, commercial_lead_id, marketing_lead_id, delegate_lead_id, operations_lead_id, design_lead_id, production_advisor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!p) return false
  const allowedIds = [
    p.created_by, p.commercial_lead_id, p.marketing_lead_id,
    p.delegate_lead_id, p.operations_lead_id, p.design_lead_id, p.production_advisor_id,
  ].filter(Boolean)
  return allowedIds.includes(session.sid)
}

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const project_id = req.nextUrl.searchParams.get('project_id')
  if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('bespoke_tasks')
    .select('*, assigned_staff:assigned_to ( id, name )')
    .eq('project_id', project_id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('bespoke_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const body = await req.json()
  const phase = body.phase || 1

  // Compute next sort_order for this project+phase so a user-added task lands
  // right after the auto-seeded SOP tasks (which start at 0). Previously this
  // defaulted to 999, which put every new task below ~13 auto-tasks — invisible
  // unless the user scrolled the phase to the bottom. Nic's bug report on 06 Jul
  // was exactly this: he added a task, it went to sort_order 999, and he didn't
  // see it.
  let nextSortOrder = 0
  if (body.sort_order == null) {
    const { data: existing } = await supabaseAdmin
      .from('bespoke_tasks')
      .select('sort_order')
      .eq('project_id', body.project_id)
      .eq('phase', phase)
      .order('sort_order', { ascending: false })
      .limit(1)
    if (existing && existing.length > 0 && existing[0].sort_order != null) {
      nextSortOrder = existing[0].sort_order + 1
    }
  }

  // Nic 2f002c2e — accept assigned_team (canonical display label) alongside
  // legacy assigned_role. Column added by supabase/bespoke_task_overhaul.sql.
  // If the column doesn't exist yet in production, Supabase returns a clear
  // error and the caller surfaces it.
  const insertRow: Record<string, unknown> = {
    project_id: body.project_id,
    title: body.title,
    description: body.description || null,
    phase,
    week_number: body.week_number || null,
    assigned_to: body.assigned_to || null,
    assigned_role: body.assigned_role || null,
    due_date: body.due_date || null,
    status: 'pending',
    sort_order: body.sort_order ?? nextSortOrder,
  }
  if (body.assigned_team) insertRow.assigned_team = body.assigned_team

  const { data, error } = await supabaseAdmin
    .from('bespoke_tasks')
    .insert(insertRow)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

/**
 * DELETE /api/bespoke/tasks?id=UUID
 * Deletes a single task. Only the project creator, an assigned team lead,
 * or a super-admin may delete. Nic build_request e606f19c.
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Look up the task's project so we can authorise the caller.
  const { data: task, error: lookupErr } = await supabaseAdmin
    .from('bespoke_tasks')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  if (!task)     return NextResponse.json({ error: 'task not found' }, { status: 404 })

  if (!(await canMutateTasks(req, task.project_id))) {
    return NextResponse.json({ error: 'only the project creator, an assigned team lead, or an admin can delete tasks' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('bespoke_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
