/**
 * Task Manager API
 * GET  — list all tasks (with assignee/assignor names + per-assignee counts)
 * POST — create a task
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendTaskManagerAssigned } from '@/app/lib/email'

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

// ── GET ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!canAccess(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_tasks')
    .select(`
      *,
      event:event_id ( id, name ),
      assigned_by_staff:assigned_by ( id, name ),
      assigned_to_staff:assigned_to ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, { name: string; total: number; not_started: number; in_progress: number; completed: number }> = {}
  for (const t of data ?? []) {
    const staff = t.assigned_to_staff as { id: string; name: string } | null
    if (!staff) continue
    if (!counts[staff.id]) counts[staff.id] = { name: staff.name, total: 0, not_started: 0, in_progress: 0, completed: 0 }
    counts[staff.id].total++
    if (t.status === 'Not-Started') counts[staff.id].not_started++
    if (t.status === 'In-Progress') counts[staff.id].in_progress++
    if (t.status === 'Completed') counts[staff.id].completed++
  }

  return NextResponse.json({ tasks: data ?? [], counts_by_assignee: counts })
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!canAccess(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.description?.trim()) return NextResponse.json({ error: 'description is required' }, { status: 400 })
  if (!body?.assigned_to) return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_tasks')
    .insert({
      event_id:      body.event_id || null,
      description:   body.description.trim(),
      assigned_by:   body.assigned_by || session!.sid,
      assigned_to:   body.assigned_to,
      assigned_date: body.assigned_date || new Date().toISOString().slice(0, 10),
      deadline:      body.deadline || null,
      status:        body.status || 'Not-Started',
      priority:      body.priority || 'Medium',
      remarks:       body.remarks || null,
    })
    .select(`
      *,
      event:event_id ( id, name )
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify assigned_by + assigned_to (deduped) — non-fatal, never blocks the response.
  try {
    const recipientIds = [...new Set([data.assigned_by, data.assigned_to, session!.sid])]
    const { data: recipients } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email')
      .in('id', recipientIds)

    const byId = new Map((recipients ?? []).map(r => [r.id, r]))
    const actorName = byId.get(session!.sid)?.name ?? 'Someone'
    const notifyIds = [...new Set([data.assigned_by, data.assigned_to])]

    await Promise.all(notifyIds.map(id => {
      const staff = byId.get(id)
      if (!staff?.email) return null
      return sendTaskManagerAssigned({
        to: staff.email,
        recipientName: staff.name,
        actorName,
        taskDescription: data.description,
        eventName: (data.event as { name: string } | null)?.name ?? null,
        priority: data.priority,
        deadline: data.deadline,
      }).catch(err => console.error('sendTaskManagerAssigned failed:', err))
    }))
  } catch (err) {
    console.error('Task creation notify failed:', err)
  }

  return NextResponse.json(data, { status: 201 })
}
