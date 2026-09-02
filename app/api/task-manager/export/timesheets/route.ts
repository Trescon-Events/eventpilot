/** GET /api/task-manager/export/timesheets — CSV export of all time-log entries. */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager } from '../../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

function csvCell(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_time_logs')
    .select(`
      *,
      task:task_id ( description ),
      staff:staff_id ( name )
    `)
    .order('start_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const headers = ['Log ID', 'Task', 'Description', 'Category', 'Worker', 'Date', 'Start Time', 'End Time', 'Hours', 'Manual Entry']
  const rows = (data ?? []).map(log => [
    log.id,
    (log.task as { description: string } | null)?.description ?? '',
    log.description ?? '',
    log.category ?? '',
    (log.staff as { name: string } | null)?.name ?? '',
    log.log_date ?? '',
    new Date(log.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    log.end_time ? new Date(log.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
    ((log.duration_seconds ?? 0) / 3600).toFixed(2),
    log.manual_entry ? 'Yes' : 'No',
  ])

  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="task-manager-timesheets-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
