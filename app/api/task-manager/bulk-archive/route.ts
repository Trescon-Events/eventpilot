/**
 * POST /api/task-manager/bulk-archive — batch archive or restore (unarchive) tasks
 * Body: { task_ids: string[], action: 'archive' | 'unarchive' }
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
  const action: 'archive' | 'unarchive' = body?.action === 'unarchive' ? 'unarchive' : 'archive'

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: 'task_ids must be a non-empty array of IDs' }, { status: 400 })
  }

  const validIds = taskIds.filter(id => typeof id === 'string' && id.trim().length > 0)
  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No valid task IDs provided' }, { status: 400 })
  }

  const updatePayload = action === 'archive'
    ? { archived_at: new Date().toISOString() }
    : { archived_at: null }

  const { error } = await supabaseAdmin
    .from('task_manager_tasks')
    .update(updatePayload)
    .in('id', validIds)

  if (error) {
    if (error.message.includes('archived_at')) {
      return NextResponse.json({ error: 'Database column archived_at missing. Please apply supabase/task_manager_archive.sql migration.' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated_count: validIds.length, action })
}
