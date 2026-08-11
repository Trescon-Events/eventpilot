import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getStakeholderEmailHeaderHtml } from '@/app/lib/branding/email-header'

/* POST /api/events/stakeholders/announcements/[id]/send-for-approval
   Body: { approvers: [{ staff_id, role_label }] }
   Creates announcement_approvals rows (one signed token each, 7-day expiry
   — same reset_token/reset_token_expires pattern as
   app/api/reset-password/route.ts, so approvers with no EventPilot account
   can still action the request), sets the announcement to pending_approval,
   emails each approver a direct review link. */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { approvers?: { staff_id: string; role_label: string }[] } | null
  if (!body?.approvers?.length) return NextResponse.json({ error: 'approvers required' }, { status: 400 })

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*, event:event_id(id, name)')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const notifiedAt = new Date().toISOString()
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  const approvalRows = body.approvers.map(a => ({
    announcement_id: id,
    approver_id: a.staff_id,
    approver_role: a.role_label,
    approval_token: randomBytes(32).toString('hex'),
    token_expires_at: tokenExpiresAt,
    notified_at: notifiedAt,
  }))

  const { data: approvals, error: insertErr } = await supabaseAdmin
    .from('announcement_approvals')
    .insert(approvalRows)
    .select('*, approver:approver_id(name, email)')

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  await supabaseAdmin
    .from('stakeholder_announcements')
    .update({ status: 'pending_approval', updated_at: notifiedAt })
    .eq('id', id)

  await sendApprovalEmails(announcement, approvals ?? []).catch(e =>
    console.error('Approval email send failed (approvals still created):', e)
  )

  return NextResponse.json({ ok: true, approvals_created: approvals?.length ?? 0 })
}

type AnnouncementRow = {
  id: string; post_copy: string | null; creative_url: string | null
  event: { id: string; name: string } | { id: string; name: string }[] | null
}
type ApprovalRow = {
  id: string; approval_token: string; approver_role: string
  approver: { name: string; email: string } | { name: string; email: string }[] | null
}

async function sendApprovalEmails(announcement: AnnouncementRow, approvals: ApprovalRow[]) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const event = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event
  const headerHtml = await getStakeholderEmailHeaderHtml()

  for (const approval of approvals) {
    const approver = Array.isArray(approval.approver) ? approval.approver[0] : approval.approver
    if (!approver?.email) continue

    const reviewUrl = `${siteUrl}/admin/events/${event?.id}/announcements/${announcement.id}/review?token=${approval.approval_token}`

    await resend.emails.send({
      from,
      to: approver.email,
      subject: `Approval needed: announcement for ${event?.name ?? 'an event'}`,
      /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/api/content/posts/[id]/approve/route.ts's existing convention) */
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          ${headerHtml}
          <h2 style="font-size:18px;color:#0F1923;margin:0 0 12px">Approval Requested — ${approver.name ?? ''}</h2>
          <p style="font-size:14px;color:#2D3E50;line-height:1.6;margin:0 0 16px">
            An announcement for <strong>${event?.name ?? 'an event'}</strong> is ready for your review as ${approval.approver_role}.
          </p>
          ${announcement.creative_url ? `<img src="${announcement.creative_url}" alt="Creative preview" style="max-width:100%;border-radius:8px;margin-bottom:16px" />` : ''}
          <p style="font-size:13px;color:#0F1923;white-space:pre-wrap;background:#F5F7FA;padding:12px;border-radius:8px;margin:0 0 20px">${announcement.post_copy ?? ''}</p>
          <a href="${reviewUrl}" style="display:inline-block;padding:10px 24px;background:#00695C;color:#fff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">Review &amp; Decide →</a>
          <p style="font-size:11px;color:#5B7080;margin:20px 0 0">This link expires in 7 days and does not require an EventPilot login. · Trescon · Event Pilot</p>
        </div>`,
      /* eslint-enable no-restricted-syntax */
    })
  }
}
