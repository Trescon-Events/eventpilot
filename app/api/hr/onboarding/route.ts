import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X              — onboarding record + tasks for a staff member
// GET  ?all=true                — all active onboardings (HR dashboard)
// POST { staff_id }             — start onboarding (picks best matching template, clones tasks)
// PATCH { task_id, status }     — update a task status
// POST { template }             — create/update onboarding template

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  const all      = searchParams.get('all') === 'true'
  const templates = searchParams.get('templates') === 'true'

  if (templates) {
    const { data, error } = await supabaseAdmin
      .from('onboarding_templates')
      .select('*, tasks:onboarding_template_tasks ( * )')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (all) {
    const { data, error } = await supabaseAdmin
      .from('staff_onboarding')
      .select(`
        *, staff:staff_id ( id, name, department, job_level, joined_at ),
        tasks:staff_onboarding_tasks ( id, title, owner, status, due_date )
      `)
      .in('status', ['in_progress', 'stalled'])
      .order('started_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_onboarding')
    .select(`
      *,
      tasks:staff_onboarding_tasks (
        *, completed_by:completed_by ( id, name ),
        course:course_id ( id, title )
      )
    `)
    .eq('staff_id', staff_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Create / update a template
  if (body.template) {
    const { name, department, job_level, description, tasks, id } = body.template
    if (!name) return NextResponse.json({ error: 'template name required' }, { status: 400 })

    let templateId = id
    if (id) {
      await supabaseAdmin.from('onboarding_templates').update({ name, department: department ?? null, job_level: job_level ?? null, description: description ?? null, updated_at: new Date().toISOString() }).eq('id', id)
    } else {
      const { data: t } = await supabaseAdmin.from('onboarding_templates').insert({ name, department: department ?? null, job_level: job_level ?? null, description: description ?? null }).select('id').single()
      templateId = t?.id
    }

    if (Array.isArray(tasks) && templateId) {
      await supabaseAdmin.from('onboarding_template_tasks').delete().eq('template_id', templateId)
      if (tasks.length > 0) {
        await supabaseAdmin.from('onboarding_template_tasks').insert(tasks.map((t, i) => ({ ...t, template_id: templateId, sort_order: i })))
      }
    }
    return NextResponse.json({ success: true, template_id: templateId })
  }

  // Start onboarding for a staff member
  const { staff_id, template_id, started_at } = body
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data: staff } = await supabaseAdmin
    .from('staff_members').select('department, job_level, joined_at').eq('id', staff_id).single()

  // Find best matching template if not specified
  let tmplId = template_id
  if (!tmplId && staff) {
    const { data: templates } = await supabaseAdmin
      .from('onboarding_templates')
      .select('id, department, job_level')
      .eq('is_active', true)

    // Score templates: exact dept+level match > dept only > level only > generic
    const scored = (templates ?? []).map(t => {
      let score = 0
      if (t.department === staff.department) score += 2
      if (t.job_level  === staff.job_level)  score += 2
      if (!t.department && !t.job_level)     score += 1  // generic
      return { id: t.id, score }
    }).filter(t => t.score > 0).sort((a, b) => b.score - a.score)

    tmplId = scored[0]?.id ?? null
  }

  // Create onboarding record
  const startDate = started_at ?? staff?.joined_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  const { data: onboarding, error: obErr } = await supabaseAdmin
    .from('staff_onboarding')
    .insert({ staff_id, template_id: tmplId ?? null, started_at: startDate, status: 'in_progress' })
    .select('id').single()

  if (obErr) return NextResponse.json({ error: obErr.message }, { status: 500 })

  // Clone tasks from template
  if (tmplId) {
    const { data: templateTasks } = await supabaseAdmin
      .from('onboarding_template_tasks')
      .select('*')
      .eq('template_id', tmplId)
      .order('sort_order')

    if (templateTasks?.length) {
      const start = new Date(startDate)
      const taskRows = templateTasks.map(t => {
        const due = new Date(start)
        due.setDate(due.getDate() + (t.due_day ?? 1))
        return {
          onboarding_id:    onboarding!.id,
          template_task_id: t.id,
          title:            t.title,
          description:      t.description,
          owner:            t.owner,
          due_date:         due.toISOString().slice(0, 10),
          course_id:        t.course_id ?? null,
          sort_order:       t.sort_order,
        }
      })
      await supabaseAdmin.from('staff_onboarding_tasks').insert(taskRows)

      // Set target end date from last task
      const lastDue = taskRows[taskRows.length - 1]?.due_date
      if (lastDue) await supabaseAdmin.from('staff_onboarding').update({ target_end: lastDue }).eq('id', onboarding!.id)
    }
  }

  // Initialise leave balances for this new hire
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/hr/leave-balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_staff: staff_id, year: new Date().getFullYear() }),
  }).catch(() => null)

  return NextResponse.json({ success: true, onboarding_id: onboarding!.id, template_used: tmplId })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { task_id, onboarding_id, status, completed_by, notes } = body

  if (task_id) {
    // Update individual task
    const patch: Record<string, unknown> = { status, notes: notes ?? null }
    if (status === 'completed') {
      patch.completed_at = new Date().toISOString()
      patch.completed_by = completed_by ?? null
    }
    const { data, error } = await supabaseAdmin
      .from('staff_onboarding_tasks').update(patch).eq('id', task_id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Check if all tasks complete → mark onboarding complete
    if (status === 'completed' && data.onboarding_id) {
      const { data: tasks } = await supabaseAdmin
        .from('staff_onboarding_tasks').select('status').eq('onboarding_id', data.onboarding_id)
      const allDone = (tasks ?? []).every(t => t.status === 'completed' || t.status === 'skipped')
      if (allDone) {
        await supabaseAdmin.from('staff_onboarding').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', data.onboarding_id)
      }
    }
    return NextResponse.json(data)
  }

  if (onboarding_id) {
    const { data, error } = await supabaseAdmin
      .from('staff_onboarding').update({ status, notes: notes ?? null }).eq('id', onboarding_id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'task_id or onboarding_id required' }, { status: 400 })
}
