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

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: log } = await supabaseAdmin
    .from('task_manager_time_logs')
    .select('task_id, start_time, task:task_id ( id, description )')
    .eq('staff_id', session.sid)
    .is('end_time', null)
    .maybeSingle()

  if (!log) return NextResponse.json({ active: null })

  const task = log.task as unknown as { id: string; description: string } | null
  return NextResponse.json({
    active: { task_id: log.task_id, task_description: task?.description ?? 'Untitled task', start_time: log.start_time },
  })
}
