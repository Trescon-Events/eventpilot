import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { generateResolvedCardResponse, TeamsActionPayload } from '@/app/admin/task-manager/teams-digest'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Missing or invalid request payload' }, { status: 400 })
    }

    // Support both Bot Framework Invoke Activity ({ value: { action: { data } } }) and direct webhook actions
    const actionData: TeamsActionPayload = rawBody.value?.action?.data || rawBody.actionData || rawBody
    const { taskId, action, daysToAdd, newDeadline } = actionData

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    // 1. Fetch current task details
    const { data: task, error: fetchErr } = await supabaseAdmin
      .from('task_manager_tasks')
      .select('id, description, status, deadline, assigned_to_staff:assigned_to(name)')
      .eq('id', taskId)
      .single()

    if (fetchErr || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const assignedStaff = task.assigned_to_staff as unknown
    const staffObj = Array.isArray(assignedStaff) ? assignedStaff[0] : assignedStaff
    const actorName = rawBody.from?.name || (staffObj as { name?: string } | null)?.name || 'Team Member'
    let resolvedDeadline = task.deadline

    // Helper function to update task with fallback retry
    async function updateTaskSafely(updates: Record<string, unknown>) {
      let res = await supabaseAdmin.from('task_manager_tasks').update(updates).eq('id', taskId)
      if (res.error && 'last_overdue_notified_at' in updates) {
        const fallback = { ...updates }
        delete fallback.last_overdue_notified_at
        res = await supabaseAdmin.from('task_manager_tasks').update(fallback).eq('id', taskId)
      }
      return res.error
    }

    // 2. Perform requested mutation
    if (action === 'complete') {
      const updateErr = await updateTaskSafely({
        status: 'Completed',
        last_overdue_notified_at: null,
        updated_at: new Date().toISOString(),
      })
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    } else if (action === 'quickReschedule') {
      const targetDate = new Date()
      targetDate.setDate(targetDate.getDate() + (daysToAdd || 2))
      resolvedDeadline = targetDate.toISOString().slice(0, 10)

      const updateErr = await updateTaskSafely({
        deadline: resolvedDeadline,
        last_overdue_notified_at: null,
        updated_at: new Date().toISOString(),
      })
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    } else if (action === 'rescheduleDate' && newDeadline) {
      resolvedDeadline = newDeadline
      const updateErr = await updateTaskSafely({
        deadline: resolvedDeadline,
        last_overdue_notified_at: null,
        updated_at: new Date().toISOString(),
      })
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 3. Generate updated Adaptive Card response
    const updatedCard = generateResolvedCardResponse({
      taskId,
      taskDescription: task.description,
      actorName,
      action,
      newDeadline: resolvedDeadline ?? undefined,
    })

    // Return synchronous Bot Framework Invoke Response (replaces card in-place)
    return NextResponse.json({
      statusCode: 200,
      type: 'application/vnd.microsoft.activity.adaptiveCard',
      value: updatedCard,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal action error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
