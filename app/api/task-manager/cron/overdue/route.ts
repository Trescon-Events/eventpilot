import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { dispatchTeamsWebhook, generateOverdueDigestCard, isStaffMorningWindow } from '@/app/admin/task-manager/teams-digest'
import { OverdueTaskDigestItem, StaffWithTimezone, Task, isCoreBrandingOrVendor } from '@/app/admin/task-manager/types'
import { sendTaskManagerFollowupDigest } from '../../_lib/followup-email'

export const runtime = 'nodejs'

const STALE_DAYS_THRESHOLD = 3
const COOLDOWN_HOURS = 3
const BRANDING_HEAD_EMAIL = 'khalifa@tresconglobal.com'

type StaffWithManager = StaffWithTimezone & {
  manager_id?: string | null
}

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

    const nowMs = Date.now()
    const todayStr = new Date(nowMs).toISOString().slice(0, 10)
    const cooldownCutoffIso = new Date(nowMs - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
    const webhookUrl = process.env.TEAMS_TASK_ALERTS_WEBHOOK_URL || ''

    // 0. Auto-archive completed tasks from previous days ("next day" threshold)
    try {
      const todayStart = new Date(nowMs)
      todayStart.setHours(0, 0, 0, 0)
      await supabaseAdmin
        .from('task_manager_tasks')
        .update({ archived_at: new Date(nowMs).toISOString() })
        .eq('status', 'Completed')
        .is('archived_at', null)
        .lt('updated_at', todayStart.toISOString())
    } catch {
      // Non-fatal if archived_at column is not yet applied
    }

    // 1. Query all active (uncompleted, unarchived) tasks to evaluate overdue OR untouched 3+ days
    let { data: rawTasks, error: taskErr } = await supabaseAdmin
      .from('task_manager_tasks')
      .select(`
        *,
        event:event_id ( id, name ),
        assigned_by_staff:assigned_by ( id, name, email ),
        assigned_to_staff:assigned_to ( id, name, email ),
        assigned_contact:assigned_contact_id ( id, name )
      `)
      .neq('status', 'Completed')
      .is('archived_at', null)

    if (taskErr && taskErr.message.includes('archived_at')) {
      const fallback = await supabaseAdmin
        .from('task_manager_tasks')
        .select(`
          *,
          event:event_id ( id, name ),
          assigned_by_staff:assigned_by ( id, name, email ),
          assigned_to_staff:assigned_to ( id, name, email ),
          assigned_contact:assigned_contact_id ( id, name )
        `)
        .neq('status', 'Completed')
      rawTasks = fallback.data
      taskErr = fallback.error
    }

    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 500 })
    }

    const activeUncompleted: Task[] = (rawTasks ?? []) as Task[]

    // Filter to tasks that are overdue OR untouched for 3+ days
    const flaggedTasks: Array<{ task: Task; daysOverdue: number; idleDays: number; reason: 'overdue' | 'stale' | 'both' }> = []
    for (const t of activeUncompleted) {
      const isOverdue = Boolean(t.deadline && t.deadline < todayStr)
      const daysOverdue = isOverdue
        ? Math.max(1, Math.round((nowMs - new Date(t.deadline!).getTime()) / (1000 * 60 * 60 * 24)))
        : 0
      const idleDays = Math.floor((nowMs - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      const isStale = idleDays >= STALE_DAYS_THRESHOLD

      if (!isOverdue && !isStale) continue

      // Skip if this task was already notified within the cooldown window (unless forced)
      if (!forceAll && t.last_overdue_notified_at && t.last_overdue_notified_at > cooldownCutoffIso) {
        continue
      }

      const reason = isOverdue && isStale ? 'both' : isOverdue ? 'overdue' : 'stale'
      flaggedTasks.push({ task: t, daysOverdue, idleDays, reason })
    }

    if (flaggedTasks.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No overdue or 3+ day untouched tasks need follow-up right now.',
        recipients_evaluated: 0,
        digests_dispatched: 0,
        emails_sent: 0,
        teams_dispatched: 0,
        tasks_notified: 0,
      })
    }

    // 2. Query all staff members (including external vendors like Pixelate / Cactus + manager_id for CC)
    let rawStaff: StaffWithManager[] = []
    const { data: staffData, error: staffErr } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email, department, role, account_type, manager_id, aad_object_id, office_timezone, working_days')

    if (staffErr) {
      const fallback = await supabaseAdmin
        .from('staff_members')
        .select('id, name, email, department, role, account_type, manager_id')
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 })
      }
      rawStaff = (fallback.data ?? []) as unknown as StaffWithManager[]
    } else {
      rawStaff = (staffData ?? []) as StaffWithManager[]
    }

    const staffList: StaffWithManager[] = rawStaff
    const staffById = new Map(staffList.map(s => [s.id, s]))

    // 3. Evaluate each recipient (both Assigned To & Assigned By)
    const dispatchResults: Array<{
      staffId: string
      name: string
      email?: string
      cc?: string[]
      localHour: number
      isWorkingDay: boolean
      tasksCount: number
      emailSent: boolean
      teamsSent: boolean
      error?: string
    }> = []

    let totalDigestsDispatched = 0
    let totalEmailsSent = 0
    let totalTeamsDispatched = 0
    const allNotifiedTaskIds = new Set<string>()

    for (const staff of staffList) {
      const timezone = staff.office_timezone || 'Asia/Dubai'
      const workingDays = staff.working_days || [1, 2, 3, 4, 5]

      const { isMorning: isInWindow, isWorkingDay, localHour } = isStaffMorningWindow(timezone, workingDays)

      // Only sweep during the 3 working-day windows (09:00, 13:00, 17:00 local time) unless forceAll
      if (!forceAll && (!isInWindow || !isWorkingDay)) {
        continue
      }

      const userDigestItems: OverdueTaskDigestItem[] = []
      for (const { task: t, daysOverdue, idleDays, reason } of flaggedTasks) {
        const isAssignee = t.assigned_to === staff.id
        const isAssignor = t.assigned_by === staff.id
        if (isAssignee || isAssignor) {
          userDigestItems.push({
            task: t,
            daysOverdue,
            idleDays,
            reason,
            isAssignee,
          })
        }
      }

      if (userDigestItems.length === 0) continue

      // Resolve Team Manager CC:
      // - Always CC Branding Head (khalifa@tresconglobal.com) for Branding team & Vendors
      // - Also CC the recipient's configured manager_id email (if any)
      const ccSet = new Set<string>()
      const recipientIsBrandingOrVendor = isCoreBrandingOrVendor(staff)
      const hasBrandingOrVendorTask = userDigestItems.some(item => {
        const assignee = staffById.get(item.task.assigned_to)
        return assignee ? isCoreBrandingOrVendor(assignee) : false
      })
      if (recipientIsBrandingOrVendor || hasBrandingOrVendorTask) {
        ccSet.add(BRANDING_HEAD_EMAIL)
      }
      if (staff.manager_id) {
        const mgrEmail = staffById.get(staff.manager_id)?.email?.trim()
        if (mgrEmail) ccSet.add(mgrEmail)
      }
      const recipientEmailLower = (staff.email ?? '').trim().toLowerCase()
      const ccEmails = [...ccSet].filter(e => e.toLowerCase() !== recipientEmailLower)

      const errors: string[] = []
      let emailSent = false
      let teamsSent = false

      // 4a. Email follow-up digest (via Resend — works for internal staff & external vendors)
      if (staff.email) {
        const emailRes = await sendTaskManagerFollowupDigest({
          to: staff.email,
          cc: ccEmails,
          recipientName: staff.name,
          items: userDigestItems,
        })
        emailSent = emailRes.success
        if (!emailRes.success && emailRes.error) {
          errors.push(`Email: ${emailRes.error}`)
        }
      } else {
        errors.push('Email: no address on file')
      }

      // 4b. Microsoft Teams Adaptive Card digest
      if (webhookUrl) {
        const cardPayload = generateOverdueDigestCard(staff, userDigestItems)
        const teamsRes = await dispatchTeamsWebhook(webhookUrl, cardPayload)
        teamsSent = teamsRes.success
        if (!teamsRes.success && teamsRes.error) {
          errors.push(`Teams: ${teamsRes.error}`)
        }
      }

      if (emailSent) totalEmailsSent++
      if (teamsSent) totalTeamsDispatched++

      if (emailSent || teamsSent) {
        totalDigestsDispatched++
        for (const item of userDigestItems) {
          allNotifiedTaskIds.add(item.task.id)
        }
      }

      dispatchResults.push({
        staffId: staff.id,
        name: staff.name,
        email: staff.email,
        cc: ccEmails,
        localHour,
        isWorkingDay,
        tasksCount: userDigestItems.length,
        emailSent,
        teamsSent,
        error: errors.length > 0 ? errors.join(' | ') : undefined,
      })
    }

    // 5. Update last_overdue_notified_at ONCE after all recipients (Assigned To + Assigned By) are processed
    if (allNotifiedTaskIds.size > 0) {
      await supabaseAdmin
        .from('task_manager_tasks')
        .update({ last_overdue_notified_at: new Date(nowMs).toISOString() })
        .in('id', Array.from(allNotifiedTaskIds))
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date(nowMs).toISOString(),
      recipients_evaluated: staffList.length,
      digests_dispatched: totalDigestsDispatched,
      emails_sent: totalEmailsSent,
      teams_dispatched: totalTeamsDispatched,
      tasks_notified: allNotifiedTaskIds.size,
      results: dispatchResults,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Sweeper execution error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
