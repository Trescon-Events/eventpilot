/**
 * POST /api/task-manager/[id]/timer   { action: 'start' | 'pause' | 'stop' }
 *
 * Start: opens a task_manager_time_logs row for this staff member. A
 * partial unique index (one open row per staff_id) enforces "one running
 * timer per person" — if they already have one open on a DIFFERENT task,
 * this returns 409 rather than a raw DB error. Starting also flips the
 * task's status to In-Progress if it was Not-Started.
 *
 * Pause/Stop: both close the open row and add its duration onto the task's
 * tracked_seconds. They're the same operation — Pause vs Stop is purely a
 * UI framing distinction (Pause implies "Resume" later), not a DB state.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

// Open to every authenticated staff member — Task Manager is no longer
// gated by an individual tool_grant (2026-08-19).
function canAccess(session: { sid: string; adm?: boolean } | null) {
  return !!session
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!canAccess(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id: taskId } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (action !== 'start' && action !== 'pause' && action !== 'stop') {
    return NextResponse.json({ error: "action must be 'start', 'pause', or 'stop'" }, { status: 400 })
  }

  const staffId = session!.sid

  const { data: openLog } = await supabaseAdmin
    .from('task_manager_time_logs')
    .select('id, task_id, start_time')
    .eq('staff_id', staffId)
    .is('end_time', null)
    .maybeSingle()

  if (action === 'start') {
    if (openLog) {
      if (openLog.task_id === taskId) return NextResponse.json({ ok: true, already_running: true })
      const { data: otherTask } = await supabaseAdmin
        .from('task_manager_tasks')
        .select('description')
        .eq('id', openLog.task_id)
        .single()
      return NextResponse.json(
        { error: `You already have a timer running on "${otherTask?.description ?? 'another task'}" — stop it first.` },
        { status: 409 },
      )
    }

    const { error: insertErr } = await supabaseAdmin
      .from('task_manager_time_logs')
      .insert({ task_id: taskId, staff_id: staffId })
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    const { data: task } = await supabaseAdmin
      .from('task_manager_tasks')
      .select('status')
      .eq('id', taskId)
      .single()
    if (task?.status === 'Not-Started') {
      await supabaseAdmin.from('task_manager_tasks').update({ status: 'In-Progress' }).eq('id', taskId)
    }

    return NextResponse.json({ ok: true })
  }

  // pause / stop
  if (!openLog || openLog.task_id !== taskId) {
    return NextResponse.json({ error: 'No active timer on this task for you.' }, { status: 409 })
  }

  const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(openLog.start_time).getTime()) / 1000))

  const { error: closeErr } = await supabaseAdmin
    .from('task_manager_time_logs')
    .update({ end_time: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq('id', openLog.id)
  if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 500 })

  const { data: task } = await supabaseAdmin
    .from('task_manager_tasks')
    .select('tracked_seconds')
    .eq('id', taskId)
    .single()
  await supabaseAdmin
    .from('task_manager_tasks')
    .update({ tracked_seconds: (task?.tracked_seconds ?? 0) + durationSeconds })
    .eq('id', taskId)

  return NextResponse.json({ ok: true, duration_seconds: durationSeconds })
}
