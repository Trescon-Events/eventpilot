import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getStakeholderEmailHeaderHtml } from '@/app/lib/branding/email-header'
import { locateApprovalToken, resolveRoundForLocated } from '@/app/lib/events/approval-round'

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
   all — that column is internal's own domain.

   First-responder-wins (2026-09-22, per Madhu) — external/client rounds
   now have a main row PLUS zero or more per-person CC rows, each with
   their own token (see approval-round.ts). Whichever one is actioned
   FIRST is the round's decision. Before writing, this re-checks the whole
   round (not just the row this token happens to be) and refuses a second
   decision once one already exists — the defensive, server-side half of
   what the review page already shows client-side via review-data's
   round-wide resolution. */

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

  // approver_id (authenticated staff, internal layer only) keeps the
  // original direct lookup — no round/CC concept applies to internal.
  if (body.approver_id) {
    const { data: approval, error: findErr } = await supabaseAdmin
      .from('announcement_approvals').select('*').eq('announcement_id', id).eq('approver_id', body.approver_id).single()
    if (findErr || !approval) return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
    return finishInternal(id, approval.id, body.status, body.comments)
  }

  const located = await locateApprovalToken(id, body.token!)
  if (!located) return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
  if (!located.token_expires_at || new Date(located.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  if (located.layer === 'internal') {
    return finishInternal(id, located.id, body.status, body.comments)
  }

  const parentId = located.kind === 'main' ? located.id : located.parent_approval_id

  // Round-lock: someone else (main or a sibling CC) may have already
  // resolved this round between when the reviewer's page loaded and when
  // they clicked Submit — re-check fresh, right before writing.
  const already = await resolveRoundForLocated(parentId, located.layer)
  if (already.status !== 'none' && already.status !== 'pending') {
    return NextResponse.json({
      error: `This request has already been handled${already.resolved_by_name ? ` by ${already.resolved_by_name}` : ''} — no further action is needed.`,
    }, { status: 409 })
  }

  const actionedAt = new Date().toISOString()
  let sentByEmail: string | null
  let resolverName: string | null

  if (located.kind === 'main') {
    const { data: mainRow, error: updateErr } = await supabaseAdmin
      .from('announcement_approvals')
      .update({ status: body.status, comments: body.comments ?? null, actioned_at: actionedAt })
      .eq('id', located.id)
      .select('sent_by_email, external_name')
      .single()
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    sentByEmail = mainRow.sent_by_email
    resolverName = mainRow.external_name
  } else {
    const ccTable = located.layer === 'client' ? 'announcement_client_approval_cc' : 'announcement_external_approval_cc'
    const [{ data: ccRow, error: updateErr }, { data: mainRow }] = await Promise.all([
      supabaseAdmin.from(ccTable)
        .update({ status: body.status, comments: body.comments ?? null, actioned_at: actionedAt })
        .eq('id', located.id)
        .select('name')
        .single(),
      // sent_by_email lives on the main row regardless of who actually
      // resolved it (a CC's own row has no sent_by_email of its own) —
      // the producer notification always goes to whoever sent this round.
      supabaseAdmin.from('announcement_approvals').select('sent_by_email').eq('id', parentId).single(),
    ])
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    sentByEmail = mainRow?.sent_by_email ?? null
    resolverName = ccRow?.name ?? null
  }

  await notifyMM(id, body.status, located.layer, sentByEmail, body.comments ?? null, resolverName).catch(e => console.error('MM notification failed (approval still recorded):', e))
  return NextResponse.json({
    ok: true, announcement_status: null,
    ...(located.layer === 'external' ? { external_approval_status: body.status } : { client_approval_status: body.status }),
  })
}

async function finishInternal(id: string, approvalRowId: string, status: ApproveBody['status'], comments: string | undefined) {
  const { error: updateErr } = await supabaseAdmin
    .from('announcement_approvals')
    .update({ status, comments: comments ?? null, actioned_at: new Date().toISOString() })
    .eq('id', approvalRowId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

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

    await notifyMM(id, newAnnouncementStatus, 'internal', internalSentByEmail, comments ?? null, null).catch(e => console.error('MM notification failed (approval still recorded):', e))
  }

  return NextResponse.json({ ok: true, announcement_status: newAnnouncementStatus ?? 'pending_approval' })
}

async function notifyMM(announcementId: string, newStatus: string, layer: 'internal' | 'external' | 'client', sentByEmail: string | null, comments: string | null, resolverName: string | null) {
  if (!process.env.RESEND_API_KEY) return

  const { data: announcement } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('created_by, speaker_id, partner_id, announcement_kind, post_copy, event:event_id(id, name), creator:created_by(email, name)')
    .eq('id', announcementId)
    .single()
  if (!announcement) return

  const creator = Array.isArray(announcement.creator) ? announcement.creator[0] : announcement.creator
  const event   = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event

  // Real bug fix (2026-08-29, per Madhu, live: "this notification itself
  // should include more details as to which speaker what was the
  // approval for.. it hardly has any info"). Was a one-line "the client
  // have signed off" with zero context on WHICH announcement — the
  // reader had to click through blind to find out. Now names the actual
  // stakeholder and quotes the reviewer's own comment when there is one.
  let stakeholderName: string | null = null
  if (announcement.speaker_id) {
    const { data: s } = await supabaseAdmin.from('event_speakers').select('name').eq('id', announcement.speaker_id).single()
    stakeholderName = s?.name ?? null
  } else if (announcement.partner_id) {
    const { data: p } = await supabaseAdmin.from('event_sponsors').select('name').eq('id', announcement.partner_id).single()
    stakeholderName = p?.name ?? null
  }
  const kindLabel = announcement.announcement_kind === 'self_promo' ? 'Self Promo' : 'Promo'
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

  // Escaped before going into raw HTML — comments (and, since
  // 2026-09-22, resolverName — whoever holds a review link, no
  // EventPilot login needed) are free-text supplied by an external
  // party, never trusted input.
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const isApproved = newStatus === 'approved' || newStatus === 'approved_with_comments'
  // Names the actual person who resolved it when known (2026-09-22, first-
  // responder-wins) — could be the speaker/client themselves OR whichever
  // CC'd assistant/office contact got there first; falls back to the
  // generic layer label for 'internal' (aggregate, no single resolver) or
  // a pre-2026-09-22 row that predates per-CC identity tracking.
  const layerLabel = resolverName ? `${escapeHtml(resolverName)} has`
    : layer === 'external' ? 'The speaker/office has' : layer === 'client' ? 'The client has' : 'All internal approvers have'
  const layerReviewerNoun = resolverName ? escapeHtml(resolverName)
    : layer === 'external' ? 'The external reviewer' : layer === 'client' ? 'The client' : 'An approver'
  const layerSubjectPrefix = layer === 'external' ? 'Externally approved' : layer === 'client' ? 'Client-approved' : 'Approved'
  const subjectContext = stakeholderName ? `${stakeholderName} (${kindLabel})` : `${kindLabel} announcement`
  const subject = isApproved
    ? `${layerSubjectPrefix}: ${subjectContext} — ${event?.name ?? 'your event'}`
    : `Changes requested: ${subjectContext} — ${event?.name ?? 'your event'}`
  // Deep-links straight to this announcement (same convention as
  // sync-status/route.ts's publishedUrl) rather than the generic
  // stakeholders list — the whole point of this email is "come look at
  // what changed," so it should land exactly there, not one click away.
  const stakeholderId = announcement.speaker_id ?? announcement.partner_id
  const reviewUrl = stakeholderId
    ? `${siteUrl}/admin/events/${event?.id}/stakeholders/${stakeholderId}?tab=announcements&announcement=${announcementId}`
    : `${siteUrl}/admin/events/${event?.id}/stakeholders`

  const stakeholderLine = stakeholderName ? `<strong>${escapeHtml(stakeholderName)}</strong> (${kindLabel}, ${event?.name ?? 'your event'})` : `a ${kindLabel} announcement for ${event?.name ?? 'your event'}`

  await resend.emails.send({
    from,
    to: recipientEmail,
    subject,
    /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/api/content/posts/[id]/approve/route.ts's existing convention) */
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">${headerHtml}
           <p style="font-size:14px;color:#2D3E50">
             ${isApproved ? `${layerLabel} signed off on ${stakeholderLine}.` : `${layerReviewerNoun} requested changes to ${stakeholderLine}.`}
           </p>
           ${comments?.trim() ? `<p style="font-size:13px;color:#0F1923;white-space:pre-wrap;background:#F5F7FA;padding:12px;border-radius:8px;font-style:italic">&quot;${escapeHtml(comments.trim())}&quot;</p>` : ''}
           <p><a href="${reviewUrl}" style="color:#00695C">Review in EventPilot →</a></p></div>`,
    /* eslint-enable no-restricted-syntax */
  })
}
