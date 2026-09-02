/**
 * PATCH /api/task-manager/timesheets/[id] — edit category/description on a log entry
 * DELETE /api/task-manager/timesheets/[id] — remove a log entry (also deducts its duration from the task's tracked_seconds)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager } from '../../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('category' in body) updates.category = body.category || null
  if ('description' in body) updates.description = body.description?.trim() || null

  const { data, error } = await supabaseAdmin
    .from('task_manager_time_logs')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      task:task_id ( id, description ),
      staff:staff_id ( id, name )
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const { data: log } = await supabaseAdmin.from('task_manager_time_logs').select('task_id, duration_seconds').eq('id', id).single()

  const { error } = await supabaseAdmin.from('task_manager_time_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (log?.task_id && log.duration_seconds) {
    const { data: task } = await supabaseAdmin.from('task_manager_tasks').select('tracked_seconds').eq('id', log.task_id).single()
    await supabaseAdmin
      .from('task_manager_tasks')
      .update({ tracked_seconds: Math.max(0, (task?.tracked_seconds ?? 0) - log.duration_seconds) })
      .eq('id', log.task_id)
  }

  return NextResponse.json({ ok: true })
}
