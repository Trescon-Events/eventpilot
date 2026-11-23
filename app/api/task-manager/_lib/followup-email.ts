/**
 * Task Manager — Automated Follow-Up Digest Email (via Resend)
 * Sends 1 consolidated email per recipient covering overdue and 3+ day untouched tasks,
 * split cleanly into "Tasks Assigned to You" and "Tasks You Assigned".
 */
import { Resend } from 'resend'
import { systemFrom } from '@/app/lib/email/system-mail'
import type { OverdueTaskDigestItem } from '@/app/admin/task-manager/types'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReasonBadge(item: OverdueTaskDigestItem): string {
  const parts: string[] = []
  if (item.daysOverdue > 0) {
    parts.push(`${item.daysOverdue}d overdue`)
  }
  if ((item.idleDays ?? 0) >= 3) {
    parts.push(`untouched ${item.idleDays}d`)
  }
  const label = parts.length > 0 ? parts.join(' · ') : 'Needs update'
  const isUrgent = item.daysOverdue > 0
  return isUrgent
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgb(254, 226, 226);color:rgb(185, 28, 28);">${escapeHtml(label)}</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgb(254, 243, 199);color:rgb(180, 83, 9);">${escapeHtml(label)}</span>`
}

function renderTaskRow(item: OverdueTaskDigestItem, role: 'assignee' | 'assignor'): string {
  const t = item.task
  const eventName = t.event?.name ? escapeHtml(t.event.name) : 'General'
  const desc = escapeHtml(t.description)
  const status = escapeHtml(t.status.replace('-', ' '))
  const deadline = t.deadline ? escapeHtml(t.deadline) : 'No deadline'
  const counterpartLabel = role === 'assignee' ? 'Assigned by' : 'Assigned to'
  const counterpartName = escapeHtml(
    role === 'assignee'
      ? (t.assigned_by_staff?.name ?? 'Team')
      : (t.assigned_to_staff?.name ?? 'Unassigned')
  )
  const taskUrl = `${APP_URL}/admin/task-manager?openTask=${encodeURIComponent(t.id)}`

  return `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid rgb(226, 232, 240);vertical-align:top;">
        <div style="font-size:11px;font-weight:700;color:rgb(100, 116, 139);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">${eventName}</div>
        <div style="font-size:14px;font-weight:700;color:rgb(15, 23, 42);margin-bottom:6px;">${desc}</div>
        <div style="font-size:12px;color:rgb(71, 85, 105);line-height:1.5;">
          ${buildReasonBadge(item)}
          &nbsp;·&nbsp; Status: <strong>${status}</strong>
          &nbsp;·&nbsp; Deadline: <strong>${deadline}</strong>
          &nbsp;·&nbsp; ${counterpartLabel}: <strong>${counterpartName}</strong>
        </div>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid rgb(226, 232, 240);vertical-align:middle;text-align:right;white-space:nowrap;">
        <a href="${taskUrl}" style="display:inline-block;background:rgb(0, 165, 163);color:white;font-size:12px;font-weight:700;padding:8px 14px;border-radius:8px;text-decoration:none;">
          Update Task &rarr;
        </a>
      </td>
    </tr>
  `
}

function renderSection(title: string, subtitle: string, items: OverdueTaskDigestItem[], role: 'assignee' | 'assignor'): string {
  if (items.length === 0) return ''
  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:rgb(15, 23, 42);margin-bottom:4px;">${escapeHtml(title)} (${items.length})</div>
      <p style="font-size:13px;color:rgb(91, 112, 128);margin:0 0 12px;line-height:1.5;">${escapeHtml(subtitle)}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:rgb(248, 250, 252);border:1px solid rgb(226, 232, 240);border-radius:10px;overflow:hidden;">
        <tbody>
          ${items.map(item => renderTaskRow(item, role)).join('')}
        </tbody>
      </table>
    </div>
  `
}

export async function sendTaskManagerFollowupDigest({
  to,
  recipientName,
  items,
}: {
  to: string
  recipientName: string
  items: OverdueTaskDigestItem[]
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const firstName = escapeHtml(recipientName.split(' ')[0] || 'there')
  const assigneeItems = items.filter(i => i.isAssignee)
  const assignorItems = items.filter(i => !i.isAssignee)
  const totalCount = items.length

  const overdueCount = items.filter(i => i.daysOverdue > 0).length
  const staleCount = items.filter(i => i.daysOverdue === 0 && (i.idleDays ?? 0) >= 3).length

  const summaryParts: string[] = []
  if (overdueCount > 0) summaryParts.push(`${overdueCount} overdue`)
  if (staleCount > 0) summaryParts.push(`${staleCount} untouched for 3+ days`)
  const summaryText = summaryParts.join(' and ') || `${totalCount} needing attention`

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:24px;background:rgb(241, 245, 249);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:640px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;border:1px solid rgb(226, 232, 240);">
          <div style="background:rgb(15, 25, 35);padding:28px 32px;text-align:center;">
            <div style="font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:rgb(0, 165, 163);margin-bottom:6px;">EventPilot · Task Manager</div>
            <h1 style="margin:0;font-size:20px;font-weight:800;color:white;">Task Follow-Up Reminder</h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgb(148, 163, 184);">${totalCount} task${totalCount === 1 ? '' : 's'} require an update (${escapeHtml(summaryText)})</p>
          </div>

          <div style="padding:28px 32px;">
            <p style="margin:0 0 20px;font-size:14px;color:rgb(51, 65, 85);line-height:1.6;">
              Hi <strong>${firstName}</strong>,<br/>
              This is an automated follow-up for tasks that are past their deadline or haven&rsquo;t been updated in 3+ days.
              <strong>Kindly update the deadline or update the task status</strong> in EventPilot.
            </p>

            ${renderSection(
              'Tasks Assigned to You',
              'Kindly update the deadline or mark the task status as In Progress / Completed.',
              assigneeItems,
              'assignee'
            )}

            ${renderSection(
              'Tasks You Assigned',
              'Kindly follow up with the assignee, revise the deadline, or update the task status if already completed.',
              assignorItems,
              'assignor'
            )}

            <div style="text-align:center;margin:28px 0 8px;">
              <a href="${APP_URL}/admin/task-manager" style="display:inline-block;background:rgb(0, 165, 163);color:white;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                Open Task Manager
              </a>
            </div>
          </div>

          <div style="padding:16px 32px;background:rgb(248, 250, 252);border-top:1px solid rgb(226, 232, 240);text-align:center;font-size:11px;color:rgb(148, 163, 184);">
            Automated reminder from EventPilot Task Manager (Mon&ndash;Fri, 3x daily). Updates stop automatically once the deadline is revised or the task is marked Completed.
          </div>
        </div>
      </body>
    </html>
  `

  try {
    const res = await getResend().emails.send({
      from: systemFrom(),
      to,
      subject: `Task Follow-Up: ${totalCount} task${totalCount === 1 ? '' : 's'} need a status or deadline update`,
      html,
    })
    if (res.error) {
      return { success: false, error: res.error.message }
    }
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Email send failed' }
  }
}
