import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getStakeholderEmailHeaderHtml } from '@/app/lib/branding/email-header'

/* POST /api/events/stakeholders/announcements/[id]/approve
   Body: { token?, approver_id?, status: 'approved'|'approved_with_comments'|
           'changes_requested', comments? }
   Public (see middleware.ts) — reachable via a signed approval_token (no
   EventPilot login) or by an authenticated staff approver_id. Exactly one
   of token/approver_id is expected.

   Three-layer approval (2026-08-26 internal+external, extended 2026-08-29
   with 'client') — the found row's `layer` decides what happens next.
   'internal' keeps the original behavior exactly: aggregate ALL internal
   rows' statuses (.every()) and write the result onto
   stakeholder_announcements.status, same as before this column existed.
   'external' and 'client' never touch stakeholder_announcements.status at
   all — that column is internal's own domain. Each of those rounds'
   current state is instead read directly off its own approval row
   wherever it's needed (e.g. the Publishing panel's readiness check), so
   there's nothing here to keep in sync. Both are handled by the exact same
   branch below — they only ever differ in which email tells the producer
   about the outcome (see notifyMM's own layer-label logic). */

type ApproveBody = {
  token?: string; approver_id?: string
  status: 'approved' | 'approved_with_comments' | 'changes_requested'
  comments?: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as ApproveBody | null
  if (!body?.status || (!body.token && !body.approver_id)) {
    return NextResponse.json({ error: 'status and (token or approver_id) required' }, { status: 400 })
  }
  if (body.status === 'changes_requested' && !body.comments?.trim()) {
    return NextResponse.json({ error: 'comments required when requesting changes' }, { status: 400 })
  }

  let approvalQuery = supabaseAdmin.from('announcement_approvals').select('*').eq('announcement_id', id)
  approvalQuery = body.token ? approvalQuery.eq('approval_token', body.token) : approvalQuery.eq('approver_id', body.approver_id!)
  const { data: approval, error: findErr } = await approvalQuery.single()

  if (findErr || !approval) return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
  if (body.token && (!approval.token_expires_at || new Date(approval.token_expires_at) < new Date())) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('announcement_approvals')
    .update({ status: body.status, comments: body.comments ?? null, actioned_at: new Date().toISOString() })
    .eq('id', approval.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  if (approval.layer === 'external' || approval.layer === 'client') {
    await notifyMM(id, body.status, approval.layer, approval.sent_by_email).catch(e => console.error('MM notification failed (approval still recorded):', e))
    return NextResponse.json({
      ok: true, announcement_status: null,
      ...(approval.layer === 'external' ? { external_approval_status: body.status } : { client_approval_status: body.status }),
    })
  }

  const { data: allApprovals } = await supabaseAdmin
    .from('announcement_approvals')
    .select('status, sent_by_email')
    .eq('announcement_id', id)
    .eq('layer', 'internal')

  const statuses = (allApprovals ?? []).map(a => a.status)
  // All rows in one internal round are created together by the same
  // send-for-approval call, so they share one sender — first non-null wins.
  const internalSentByEmail = (allApprovals ?? []).map(a => a.sent_by_email).find(Boolean) ?? null
  let newAnnouncementStatus: string | null = null
  if (statuses.includes('changes_requested')) {
    newAnnouncementStatus = 'changes_requested'
  } else if (statuses.every(s => s === 'approved' || s === 'approved_with_comments')) {
    newAnnouncementStatus = statuses.includes('approved_with_comments') ? 'approved_with_comments' : 'approved'
  }

  if (newAnnouncementStatus) {
    await supabaseAdmin
      .from('stakeholder_announcements')
      .update({ status: newAnnouncementStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    await notifyMM(id, newAnnouncementStatus, 'internal', internalSentByEmail).catch(e => console.error('MM notification failed (approval still recorded):', e))
  }

  return NextResponse.json({ ok: true, announcement_status: newAnnouncementStatus ?? 'pending_approval' })
}

async function notifyMM(announcementId: string, newStatus: string, layer: 'internal' | 'external' | 'client', sentByEmail: string | null) {
  if (!process.env.RESEND_API_KEY) return

  const { data: announcement } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('created_by, speaker_id, partner_id, event:event_id(id, name), creator:created_by(email, name)')
    .eq('id', announcementId)
    .single()
  if (!announcement) return

  const creator = Array.isArray(announcement.creator) ? announcement.creator[0] : announcement.creator
  const event   = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event
  // Real bug fix (2026-08-29, found live by Madhu): this used to notify
  // ONLY the announcement's original creator, a global field with nothing
  // to do with who actually sent THIS approval round — frequently null
  // outright (confirmed on the exact row Madhu tested against), which
  // silently no-op'd this whole function with zero visible error. Now
  // notifies whoever actually sent this specific round (sentByEmail,
  // resolved per-row at send time), falling back to the announcement's
  // creator only for pre-fix rows that predate the sent_by_email column.
  const recipientEmail = sentByEmail ?? creator?.email
  if (!recipientEmail) return

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const headerHtml = await getStakeholderEmailHeaderHtml()

  const isApproved = newStatus === 'approved' || newStatus === 'approved_with_comments'
  const layerLabel = layer === 'external' ? 'The speaker/office' : layer === 'client' ? 'The client' : 'All internal approvers'
  const layerSubjectPrefix = layer === 'external' ? 'Externally approved' : layer === 'client' ? 'Client-approved' : 'Approved'
  const subject = isApproved
    ? `${layerSubjectPrefix}: announcement for ${event?.name ?? 'your event'}`
    : `Changes requested: announcement for ${event?.name ?? 'your event'}`
  // Deep-links straight to this announcement (same convention as
  // sync-status/route.ts's publishedUrl) rather than the generic
  // stakeholders list — the whole point of this email is "come look at
  // what changed," so it should land exactly there, not one click away.
  const stakeholderId = announcement.speaker_id ?? announcement.partner_id
  const reviewUrl = stakeholderId
    ? `${siteUrl}/admin/events/${event?.id}/stakeholders/${stakeholderId}?tab=announcements&announcement=${announcementId}`
    : `${siteUrl}/admin/events/${event?.id}/stakeholders`

  await resend.emails.send({
    from,
    to: recipientEmail,
    subject,
    /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/api/content/posts/[id]/approve/route.ts's existing convention) */
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">${headerHtml}
           <p style="font-size:14px;color:#2D3E50">
             ${isApproved ? `${layerLabel} have signed off on this announcement.` : `${layer === 'external' ? 'The external reviewer' : layer === 'client' ? 'The client' : 'An approver'} has requested changes to this announcement.`}
           </p>
           <p><a href="${reviewUrl}" style="color:#00695C">Review in EventPilot →</a></p></div>`,
    /* eslint-enable no-restricted-syntax */
  })
}
