/**
 * PATCH /api/task-manager/[id] — edit any task field (status/priority/remarks/etc.)
 * DELETE /api/task-manager/[id] — delete a task (cascades its time logs)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendTaskManagerStatusChanged } from '@/app/lib/email'
import { canAccessTaskManager } from '../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

const EDITABLE_FIELDS = ['event_id', 'description', 'assigned_by', 'assigned_to', 'assigned_contact_id', 'task_type_id', 'assigned_date', 'deadline', 'status', 'priority', 'remarks'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  // Fetch the pre-update status so we can tell if this PATCH is actually a
  // status transition (only status changes trigger a notification email —
  // priority/remarks/etc. edits shouldn't spam both parties).
  const { data: before } = await supabaseAdmin.from('task_manager_tasks').select('status').eq('id', id).single()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }

  if (updates.status === 'Completed' || 'deadline' in updates) {
    updates.last_overdue_notified_at = null
  }

  let { data, error } = await supabaseAdmin
    .from('task_manager_tasks')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      event:event_id ( id, name ),
      assigned_by_staff:assigned_by ( id, name, email ),
      assigned_to_staff:assigned_to ( id, name, email ),
      assigned_contact:assigned_contact_id ( id, name ),
      task_type:task_type_id ( id, label )
    `)
    .single()

  // Fallback resilience: If column last_overdue_notified_at does not exist in DB yet, retry without it
  if (error && 'last_overdue_notified_at' in updates) {
    const fallbackUpdates = { ...updates }
    delete fallbackUpdates.last_overdue_notified_at
    const retry = await supabaseAdmin
      .from('task_manager_tasks')
      .update(fallbackUpdates)
      .eq('id', id)
      .select(`
        *,
        event:event_id ( id, name ),
        assigned_by_staff:assigned_by ( id, name, email ),
        assigned_to_staff:assigned_to ( id, name, email ),
        assigned_contact:assigned_contact_id ( id, name ),
        task_type:task_type_id ( id, label )
      `)
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const statusChanged = 'status' in updates && before?.status && before.status !== data.status
  if (statusChanged) {
    try {
      const recipientIds = [...new Set([data.assigned_by, data.assigned_to, session!.sid])]
      const { data: recipients } = await supabaseAdmin
        .from('staff_members')
        .select('id, name, email')
        .in('id', recipientIds)

      const byId = new Map((recipients ?? []).map(r => [r.id, r]))
      const actorName = byId.get(session!.sid)?.name ?? 'Someone'
      const notifyIds = [...new Set([data.assigned_by, data.assigned_to])]

      await Promise.all(notifyIds.map(recipientId => {
        const staff = byId.get(recipientId)
        if (!staff?.email) return null
        return sendTaskManagerStatusChanged({
          to: staff.email,
          recipientName: staff.name,
          actorName,
          taskDescription: data.description,
          eventName: (data.event as { name: string } | null)?.name ?? null,
          oldStatus: before.status,
          newStatus: data.status,
        }).catch(err => console.error('sendTaskManagerStatusChanged failed:', err))
      }))
    } catch (err) {
      console.error('Task status-change notify failed:', err)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const { error } = await supabaseAdmin.from('task_manager_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
