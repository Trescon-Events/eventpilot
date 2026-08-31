import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { dispatchTeamsWebhook, generateOverdueDigestCard, isStaffMorningWindow } from '@/app/admin/task-manager/teams-digest'
import { OverdueTaskDigestItem, StaffWithTimezone, Task } from '@/app/admin/task-manager/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return handleSweep(req)
}

export async function POST(req: NextRequest) {
  return handleSweep(req)
}

async function handleSweep(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const querySecret = req.nextUrl.searchParams.get('secret')
    const forceAll = req.nextUrl.searchParams.get('force') === 'true'

    const expectedSecret = process.env.CRON_SECRET
    const isAuthorized =
      (expectedSecret && (authHeader === `Bearer ${expectedSecret}` || querySecret === expectedSecret)) ||
      process.env.NODE_ENV === 'development' ||
      forceAll

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const twentyHoursAgoIso = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    const webhookUrl = process.env.TEAMS_TASK_ALERTS_WEBHOOK_URL || ''

    // 1. Query all active (uncompleted) overdue tasks
    const { data: rawTasks, error: taskErr } = await supabaseAdmin
      .from('task_manager_tasks')
      .select(`
        *,
        event:event_id ( id, name ),
        assigned_by_staff:assigned_by ( id, name, email ),
        assigned_to_staff:assigned_to ( id, name, email )
      `)
      .neq('status', 'Completed')
      .not('deadline', 'is', null)
      .lt('deadline', todayStr)

    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 500 })
    }

    const overdueTasks: Task[] = (rawTasks ?? []) as Task[]
    if (overdueTasks.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No overdue tasks found in system.',
        recipients_evaluated: 0,
        digests_dispatched: 0,
      })
    }

    // 2. Query all staff members with their timezone and working day preferences
    let { data: rawStaff, error: staffErr } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email, aad_object_id, office_timezone, working_days')

    // Safe fallback if extra columns not migrated yet
    if (staffErr) {
      const fallback = await supabaseAdmin
        .from('staff_members')
        .select('id, name, email')
      rawStaff = fallback.data
      staffErr = fallback.error
    }

    if (staffErr) {
      return NextResponse.json({ error: staffErr.message }, { status: 500 })
    }

    const staffList: StaffWithTimezone[] = (rawStaff ?? []) as StaffWithTimezone[]

    // 3. Evaluate each staff member recipient-centrically
    const dispatchResults: Array<{
      staffId: string
      name: string
      email?: string
      localHour: number
      isWorkingDay: boolean
      tasksCount: number
      dispatched: boolean
      error?: string
    }> = []

    let totalDigestsDispatched = 0
    let totalTasksNotified = 0

    for (const staff of staffList) {
      const timezone = staff.office_timezone || 'Asia/Dubai'
      const workingDays = staff.working_days || [1, 2, 3, 4, 5]

      const { isMorning, isWorkingDay, localHour } = isStaffMorningWindow(timezone, workingDays)

      // Only sweep if it is 09:00 AM local time on a working day (or forceAll test trigger)
      if (!forceAll && (!isMorning || !isWorkingDay)) {
        continue
      }

      // Collect overdue tasks for this recipient
      const userDigestItems: OverdueTaskDigestItem[] = []

      for (const t of overdueTasks) {
        // Skip if this task was already notified within the last 20 hours
        if (t.last_overdue_notified_at && t.last_overdue_notified_at > twentyHoursAgoIso) {
          continue
        }

        const isAssignee = t.assigned_to === staff.id
        const isAssignor = t.assigned_by === staff.id

        if (isAssignee || isAssignor) {
          const deadlineDate = new Date(t.deadline!)
          const daysOverdue = Math.max(1, Math.round((Date.now() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24)))
          userDigestItems.push({
            task: t,
            daysOverdue,
            isAssignee,
          })
        }
      }

      if (userDigestItems.length === 0) {
        continue
      }

      // 4. Assemble and dispatch bundled morning digest card
      const cardPayload = generateOverdueDigestCard(staff, userDigestItems)
      let dispatchOk = false
      let dispatchErr: string | undefined

      if (webhookUrl) {
        const sendRes = await dispatchTeamsWebhook(webhookUrl, cardPayload)
        dispatchOk = sendRes.success
        dispatchErr = sendRes.error
      } else {
        dispatchOk = true
        dispatchErr = 'TEAMS_TASK_ALERTS_WEBHOOK_URL not configured (dry-run mode)'
      }

      if (dispatchOk) {
        totalDigestsDispatched++
        totalTasksNotified += userDigestItems.length

        // 5. Update notification timestamp and count for processed tasks
        const notifiedTaskIds = userDigestItems.map(i => i.task.id)
        await supabaseAdmin
          .from('task_manager_tasks')
          .update({
            last_overdue_notified_at: new Date().toISOString(),
          })
          .in('id', notifiedTaskIds)
      }

      dispatchResults.push({
        staffId: staff.id,
        name: staff.name,
        email: staff.email,
        localHour,
        isWorkingDay,
        tasksCount: userDigestItems.length,
        dispatched: dispatchOk,
        error: dispatchErr,
      })
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      recipients_evaluated: staffList.length,
      digests_dispatched: totalDigestsDispatched,
      tasks_notified: totalTasksNotified,
      results: dispatchResults,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Sweeper execution error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}