/**
 * GET /api/task-manager/timer/active
 *
 * Returns the current session's open time log, if any — the single source
 * of truth for the global "currently tracking" widget. Sourced from the
 * server (not client-held React state) so it stays correct across page
 * navigation within the module, not just within one page's lifetime.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager } from '../../_lib/access'
import { getSession as verifiedGetSession } from '@/app/lib/access/session'

function getSession(req: NextRequest) {
  // Signature-verified (2026-09-25 cookie sweep) — never decode tcs_session by hand.
  return verifiedGetSession(req)
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: log } = await supabaseAdmin
    .from('task_manager_time_logs')
    .select('task_id, start_time, task:task_id ( id, description )')
    .eq('staff_id', session!.sid)
    .is('end_time', null)
    .maybeSingle()

  if (!log) return NextResponse.json({ active: null })

  const task = log.task as unknown as { id: string; description: string } | null
  return NextResponse.json({
    active: { task_id: log.task_id, task_description: task?.description ?? 'Untitled task', start_time: log.start_time },
  })
}
