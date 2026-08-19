/** GET /api/task-manager/export — CSV export of all tasks. */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

function csvCell(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_tasks')
    .select(`
      *,
      event:event_id ( name ),
      assigned_by_staff:assigned_by ( name ),
      assigned_to_staff:assigned_to ( name )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const headers = ['Event', 'Description', 'Assigned By', 'Assigned To', 'Assigned Date', 'Deadline', 'Status', 'Priority', 'Remarks', 'Tracked Hours']
  const rows = (data ?? []).map(t => [
    (t.event as { name: string } | null)?.name ?? '',
    t.description,
    (t.assigned_by_staff as { name: string } | null)?.name ?? '',
    (t.assigned_to_staff as { name: string } | null)?.name ?? '',
    t.assigned_date ?? '',
    t.deadline ?? '',
    t.status,
    t.priority,
    t.remarks ?? '',
    (t.tracked_seconds / 3600).toFixed(2),
  ])

  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="task-manager-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
