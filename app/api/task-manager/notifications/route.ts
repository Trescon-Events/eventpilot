/**
 * GET /api/task-manager/notifications?since=<ISO timestamp>
 *
 * Tasks newly assigned to the current session's staff id since `since` —
 * polled client-side by app/admin/task-manager/NotificationManager.tsx.
 * assigned_to_changed_at only moves when assigned_to itself changes (see
 * the trigger in supabase/task_manager_notifications.sql), not on every
 * field edit, so editing remarks/priority on an existing task never
 * false-positives a "newly assigned" notification.
 *
 * Returns `polled_at` (this server's own clock) alongside the tasks —
 * the client advances its `since` cursor to that instead of its own
 * Date.now(), so client/server clock skew can't cause a missed or
 * re-fired notification on the next poll.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager } from '../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const since = req.nextUrl.searchParams.get('since')
  if (!since) return NextResponse.json({ error: 'since is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_tasks')
    .select('*, event:event_id ( id, name )')
    .eq('assigned_to', session!.sid)
    .gt('assigned_to_changed_at', since)
    .order('assigned_to_changed_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tasks = (data ?? []).map(t => ({
    id: t.id,
    description: t.description,
    event_name: (t.event as { name: string } | null)?.name ?? null,
  }))

  return NextResponse.json({ tasks, polled_at: new Date().toISOString() })
}
