/**
 * POST /api/bespoke/tasks/reseed
 * body: { project_id: string; force?: boolean }
 *
 * Retroactive 43-task auto-seed for existing projects (Nic build_request
 * 09390aeb). The original auto-seed only fires on POST /api/bespoke
 * (project creation). Projects created before the SOP blueprint was
 * introduced — or projects whose original seed silently failed — end up
 * with 0 tasks and a permanently empty Tasks tab.
 *
 * SAFETY: this route ONLY inserts when bespoke_tasks.count === 0 for the
 * project. It never touches existing task rows, completion state, edits,
 * deletions, or additions. If the caller passes force=true AND the
 * caller is a super-admin, the route will insert regardless — reserved
 * for admin recovery after a manual purge. Default behaviour is safe.
 *
 * Auth: same session model as other Bespoke Tasks routes. Anyone who
 * can view the project (i.e. any authenticated staff) can trigger the
 * seed. The Tasks-tab client calls this automatically on mount when
 * tasks.length === 0.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { buildTasksForProject } from '@/app/lib/bespoke/task-templates'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const projectId = String(body?.project_id ?? '').trim()
  const force     = !!body?.force
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  // 1. Load the project so we can read client_company, venue, format, dates + leads.
  const { data: project, error: projErr } = await supabaseAdmin
    .from('bespoke_projects')
    .select(`
      id, client_company, venue, city, format,
      contract_signed_date, event_date,
      commercial_lead_id, marketing_lead_id, delegate_lead_id,
      operations_lead_id, design_lead_id, production_advisor_id
    `)
    .eq('id', projectId)
    .maybeSingle()

  if (projErr)   return NextResponse.json({ error: projErr.message }, { status: 500 })
  if (!project)  return NextResponse.json({ error: 'project not found' }, { status: 404 })

  // 2. Count existing tasks. If any exist, refuse unless force=true + super-admin.
  const { count: existingCount, error: countErr } = await supabaseAdmin
    .from('bespoke_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

  if ((existingCount ?? 0) > 0 && !(force && session.adm)) {
    return NextResponse.json({
      ok: false,
      reason: 'project_has_tasks',
      existing_count: existingCount,
      message: 'Project already has tasks. Pass force=true as a super-admin only to override.',
    }, { status: 409 })
  }

  // 3. Build tasks from the shared 43-task blueprint (same source used by
  //    the create-project POST — Nic 09390aeb specifically asks for this
  //    parity so the "Load Standard 43 SOP Tasks" button produces
  //    identical results to a fresh project creation).
  const tasks = buildTasksForProject(project)

  // If force=true wiped an existing project's tasks, we've already blocked
  // above unless super-admin. When actually overriding, delete old rows
  // first so we don't hit sort_order or team-badge duplicates.
  if (force && session.adm && (existingCount ?? 0) > 0) {
    const { error: delErr } = await supabaseAdmin
      .from('bespoke_tasks')
      .delete()
      .eq('project_id', projectId)
    if (delErr) return NextResponse.json({ error: `force delete failed: ${delErr.message}` }, { status: 500 })
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('bespoke_tasks')
    .insert(tasks)
    .select('id')
  if (insErr) return NextResponse.json({ error: `seed insert failed: ${insErr.message}` }, { status: 500 })

  return NextResponse.json({
    ok:            true,
    tasks_created: inserted?.length ?? 0,
    forced:        force && session.adm,
  }, { status: 201 })
}
