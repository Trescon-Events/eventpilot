/**
 * POST /api/task-manager/bulk-delete — delete multiple tasks in a single batch
 * Automatically cascades to task_manager_time_logs via foreign key constraint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager } from '../_lib/access'
import { getSession as verifiedGetSession } from '@/app/lib/access/session'

function getSession(req: NextRequest) {
  return verifiedGetSession(req)
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const taskIds: string[] = body?.task_ids ?? []

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: 'task_ids must be a non-empty array of IDs' }, { status: 400 })
  }

  // Filter out any non-string or blank IDs
  const validIds = taskIds.filter(id => typeof id === 'string' && id.trim().length > 0)
  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No valid task IDs provided' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('task_manager_tasks')
    .delete()
    .in('id', validIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted_count: validIds.length })
}
