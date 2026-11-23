/**
 * Microsoft Teams Adaptive Card Generator & Dispatch Engine
 * Conforms to Adaptive Card v1.5 with Bot Framework Action.Execute and Azure AD Object ID mentions.
 */
import { OverdueTaskDigestItem, StaffWithTimezone } from './types'

export type TeamsActionVerb = 'markCompleted' | 'quickReschedule' | 'rescheduleDate'

export interface TeamsActionPayload {
  taskId: string
  action: 'complete' | 'quickReschedule' | 'rescheduleDate'
  daysToAdd?: number
  newDeadline?: string
}

export const FOLLOWUP_LOCAL_HOURS = [9, 13, 17] as const

/**
 * Calculates if a given staff member's local office time is within one of the 3 daily
 * follow-up windows (09:00, 13:00, 17:00) and whether today is a configured working day (Mon–Fri).
 */
export function isStaffMorningWindow(
  timezone: string = 'Asia/Dubai',
  workingDays: number[] = [1, 2, 3, 4, 5],
  refDate: Date = new Date()
): { isMorning: boolean; isWorkingDay: boolean; localHour: number; localDay: number } {
  try {
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })

    const localHour = parseInt(hourFormatter.format(refDate), 10)
    // Day of week: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
    const rawDay = new Date(refDate.toLocaleString('en-US', { timeZone: timezone })).getDay()
    const isoDay = rawDay === 0 ? 7 : rawDay

    const isWorkingDay = workingDays.includes(isoDay)
    const isMorning = (FOLLOWUP_LOCAL_HOURS as readonly number[]).includes(localHour)

    return { isMorning, isWorkingDay, localHour, localDay: isoDay }
  } catch {
    const hour = (refDate.getUTCHours() + 4) % 24 // Dubai UTC+4 default
    return {
      isMorning: (FOLLOWUP_LOCAL_HOURS as readonly number[]).includes(hour),
      isWorkingDay: true,
      localHour: hour,
      localDay: 1,
    }
  }
}

/**
 * Generates an Enterprise Microsoft Teams Adaptive Card v1.5 containing a bundled
 * morning digest of overdue tasks with interactive Action.Execute buttons and AAD push mentions.
 */
export function generateOverdueDigestCard(
  recipient: StaffWithTimezone,
  items: OverdueTaskDigestItem[],
  appBaseUrl: string = 'https://eventpilot.tresconglobal.com'
) {
  const assigneeTasks = items.filter(i => i.isAssignee)
  const assignorTasks = items.filter(i => !i.isAssignee)
  const totalCount = items.length

  const mentionId = recipient.aad_object_id || recipient.email || recipient.name
  const mentionTag = `<at>${recipient.name}</at>`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardBody: any[] = [
    {
      type: 'Container',
      style: 'attention',
      items: [
        {
          type: 'ColumnSet',
          columns: [
            {
              type: 'Column',
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: '🚨',
                  size: 'Large',
                },
              ],
            },
            {
              type: 'Column',
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: 'TASK FOLLOW-UP REMINDER',
                  weight: 'Bolder',
                  size: 'Medium',
                  color: 'Attention',
                },
                {
                  type: 'TextBlock',
                  text: `${totalCount} task${totalCount === 1 ? '' : 's'} need a deadline or status update`,
                  size: 'Small',
                  isSubtle: true,
                  spacing: 'None',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'TextBlock',
      text: `Hi ${mentionTag}, kindly update the deadline or update the task status for the following task${totalCount === 1 ? '' : 's'}:`,
      wrap: true,
      spacing: 'Medium',
    },
  ]

  const formatAlertLabel = (deadline: string | null, daysOverdue: number, idleDays?: number) => {
    const tags: string[] = []
    if (daysOverdue > 0) tags.push(`${daysOverdue}d overdue`)
    if ((idleDays ?? 0) >= 3) tags.push(`untouched ${idleDays}d`)
    const suffix = tags.length > 0 ? ` (${tags.join(' · ')})` : ''
    return `⚠️ ${deadline ?? 'No deadline'}${suffix}`
  }

  // Section 1: Tasks Awaiting Recipient's Action (Assignee)
  if (assigneeTasks.length > 0) {
    cardBody.push({
      type: 'TextBlock',
      text: `**📌 Tasks Assigned to You (${assigneeTasks.length})**`,
      weight: 'Bolder',
      size: 'Medium',
      spacing: 'Large',
      color: 'Warning',
    })

    assigneeTasks.forEach(({ task, daysOverdue, idleDays }, idx) => {
      const eventLabel = task.event?.name ? `[${task.event.name}] ` : ''
      const assignerName = task.assigned_by_staff?.name ?? 'Manager'
      const contactLabel = task.assigned_contact ? ` — for: ${task.assigned_contact.name}` : ''

      cardBody.push({
        type: 'Container',
        separator: idx > 0,
        style: 'emphasis',
        items: [
          {
            type: 'TextBlock',
            text: `**${idx + 1}. ${eventLabel}${task.description}${contactLabel}**`,
            weight: 'Bolder',
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Deadline / Alert:', value: formatAlertLabel(task.deadline, daysOverdue, idleDays) },
              { title: 'Assigned By:', value: assignerName },
              { title: 'Priority:', value: task.priority },
              { title: 'Current Status:', value: task.status.replace('-', ' ') },
            ],
          },
        ],
      })
    })
  }

  // Section 2: Tasks Assigned By Recipient (Assignor Supervision)
  if (assignorTasks.length > 0) {
    cardBody.push({
      type: 'TextBlock',
      text: `**👀 Tasks You Assigned Needing Update (${assignorTasks.length})**`,
      weight: 'Bolder',
      size: 'Medium',
      spacing: 'Large',
      color: 'Accent',
    })

    assignorTasks.forEach(({ task, daysOverdue, idleDays }, idx) => {
      const eventLabel = task.event?.name ? `[${task.event.name}] ` : ''
      const assigneeName = task.assigned_to_staff?.name ?? 'Team Member'
      const assigneeEmail = task.assigned_to_staff?.email ?? ''

      cardBody.push({
        type: 'Container',
        separator: idx > 0,
        items: [
          {
            type: 'TextBlock',
            text: `**${idx + 1}. ${eventLabel}${task.description}**`,
            weight: 'Bolder',
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Assignee:', value: assigneeName },
              ...(task.assigned_contact ? [{ title: 'For:', value: task.assigned_contact.name }] : []),
              { title: 'Deadline / Alert:', value: formatAlertLabel(task.deadline, daysOverdue, idleDays) },
              { title: 'Status:', value: task.status.replace('-', ' ') },
            ],
          },
          ...(assigneeEmail ? [
            {
              type: 'ActionSet',
              actions: [
                {
                  type: 'Action.OpenUrl',
                  title: `💬 Ping ${assigneeName} on Teams`,
                  url: `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(assigneeEmail)}&message=${encodeURIComponent(`Hi ${assigneeName}, kindly update the deadline or task status for: "${task.description}".`)}`,
                },
              ],
            },
          ] : []),
        ],
      })
    })
  }

  // Global Actions: Direct link to EventPilot Task Manager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardActions: any[] = [
    {
      type: 'Action.OpenUrl',
      title: '🌐 Open Task Manager ➔',
      url: `${appBaseUrl}/admin/task-manager`,
    },
  ]

  // For individual primary tasks, append quick Action.Execute resolution actions
  if (assigneeTasks.length === 1) {
    const singleTask = assigneeTasks[0].task
    cardActions.unshift(
      {
        type: 'Action.Execute',
        title: '✅ Mark Resolved',
        verb: 'markCompleted',
        data: {
          taskId: singleTask.id,
          action: 'complete',
        },
      },
      {
        type: 'Action.Execute',
        title: '⚡ +2 Days',
        verb: 'quickReschedule',
        data: {
          taskId: singleTask.id,
          action: 'quickReschedule',
          daysToAdd: 2,
        },
      }
    )
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.5',
          body: cardBody,
          actions: cardActions,
          msteams: {
            entities: [
              {
                type: 'mention',
                text: mentionTag,
                mentioned: {
                  id: mentionId,
                  name: recipient.name,
                },
              },
            ],
          },
        },
      },
    ],
  }
}

/**
 * Generates an updated Adaptive Card response for Bot Framework Invoke requests,
 * replacing the original alert card in-place with a green success status banner.
 */
export function generateResolvedCardResponse(params: {
  taskId: string
  taskDescription?: string
  actorName: string
  action: 'complete' | 'quickReschedule' | 'rescheduleDate'
  newDeadline?: string
}) {
  const isComplete = params.action === 'complete'
  const timeString = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const dateString = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'Container',
        style: 'good',
        items: [
          {
            type: 'TextBlock',
            text: isComplete ? '✅ TASK COMPLETED' : '📅 DEADLINE RESCHEDULED',
            weight: 'Bolder',
            size: 'Medium',
            color: 'Good',
          },
          {
            type: 'TextBlock',
            text: params.taskDescription ? `**${params.taskDescription}**` : 'Task updated successfully',
            wrap: true,
          },
          {
            type: 'TextBlock',
            text: isComplete
              ? `Marked as **Completed** by **${params.actorName}** on ${dateString} at ${timeString}. Recurring overdue reminders have stopped.`
              : `Deadline extended to **${params.newDeadline}** by **${params.actorName}** on ${dateString} at ${timeString}.`,
            wrap: true,
            size: 'Small',
            isSubtle: true,
          },
        ],
      },
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: '🌐 Open in Task Manager',
        url: `https://eventpilot.tresconglobal.com/admin/task-manager?taskId=${params.taskId}`,
      },
    ],
  }
}

/**
 * Dispatches an Adaptive Card payload to a Microsoft Teams Webhook / Power Automate URL.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchTeamsWebhook(webhookUrl: string, payload: any): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `Teams webhook responded with status ${res.status}: ${text}` }
    }

    return { success: true }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network dispatch failure'
    return { success: false, error: errorMsg }
  }
}