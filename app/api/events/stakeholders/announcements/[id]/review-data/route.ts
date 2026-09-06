import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/announcements/[id]/review-data?token=X
   Public (see middleware.ts), read-only. Deliberately a separate, narrow
   endpoint rather than widening access on the general announcement CRUD
   route — a token only ever unlocks exactly what an approver needs to see
   (creative, copy, platforms, who sent it), nothing else. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: approvalRow } = await supabaseAdmin
    .from('announcement_approvals')
    .select('approver_role, token_expires_at, status, notified_at, actioned_at, comments, layer, external_name, external_email, sent_by_name, approver:approver_id(name, email)')
    .eq('announcement_id', id)
    .eq('approval_token', token)
    .single()

  // Client Approval CC recipient (2026-09-06) — their own token lives in
  // announcement_client_approval_cc, not announcement_approvals, since
  // they're tracked independently of the primary (see that table's own
  // migration doc comment). Reshaped into the same fields the rest of this
  // route/the review page already expect, so nothing downstream needs to
  // know which table it came from.
  let approval = approvalRow
  let isClientCc = false
  if (!approval) {
    const { data: ccRow } = await supabaseAdmin
      .from('announcement_client_approval_cc')
      .select('name, email, token_expires_at, status, notified_at, actioned_at, comments, parent_approval_id, parent:parent_approval_id(announcement_id, sent_by_name)')
      .eq('approval_token', token)
      .maybeSingle()
    const parent = ccRow ? (Array.isArray(ccRow.parent) ? ccRow.parent[0] : ccRow.parent) : null
    if (ccRow && parent?.announcement_id === id) {
      isClientCc = true
      approval = {
        approver_role: 'Client Reviewer', token_expires_at: ccRow.token_expires_at, status: ccRow.status,
        notified_at: ccRow.notified_at, actioned_at: ccRow.actioned_at, comments: ccRow.comments, layer: 'client',
        external_name: ccRow.name, external_email: ccRow.email, sent_by_name: parent?.sent_by_name ?? null, approver: [],
      }
    }
  }

  if (!approval) return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
  if (!approval.token_expires_at || new Date(approval.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  const { data: announcement } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('post_copy, creative_url, platforms, scheduled_for, status, event:event_id(name), creator:created_by(name)')
    .eq('id', id)
    .single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const approver = Array.isArray(approval.approver) ? approval.approver[0] : approval.approver
  const event    = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event
  const creator  = Array.isArray(announcement.creator) ? announcement.creator[0] : announcement.creator

  return NextResponse.json({
    event_name: event?.name ?? null,
    // sent_by_name (2026-08-27) — the real name of whoever actually
    // triggered THIS request (resolved at send time, per-row), not a
    // hardcoded placeholder. Falls back to the announcement's creator only
    // for pre-fix rows that predate this column, never to a generic role
    // label — an empty value reads better in the UI than a wrong name.
    sent_by: approval.sent_by_name ?? creator?.name ?? null,
    sent_at: approval.notified_at,
    approver_name: approver?.name ?? approval.external_name ?? null,
    // approver_email (2026-08-29, per Madhu, live — a CC'd recipient who
    // opened the link after someone else already responded had no way to
    // tell WHO, and the page's generic "Decision recorded" read as if
    // they themselves needed to act too): whoever this request was
    // actually addressed to, so the already-responded state can name them
    // — the system has no way to know which specific person on a shared
    // To/CC email actually clicked, only who the request was sent to.
    approver_email: approver?.email ?? approval.external_email ?? null,
    approver_role: approval.layer === 'external' ? 'External Reviewer' : approval.layer === 'client' ? 'Client Reviewer' : approval.approver_role,
    // CC'd Client Approval reviewers (2026-09-06) — their own decision is
    // tracked independently but never gates publishing, unlike the
    // primary's. The review page uses this to say so explicitly, so a
    // CC'd person doesn't think their "Approve" click is what unblocks
    // the post.
    is_client_cc: isClientCc,
    approval_status: approval.status,
    // Only meaningful once already actioned — the decision screen uses
    // these to say what happened, not just that "a" decision happened.
    decision_comments: approval.comments,
    decision_actioned_at: approval.actioned_at,
    post_copy: announcement.post_copy,
    creative_url: announcement.creative_url,
    platforms: announcement.platforms,
    scheduled_for: announcement.scheduled_for,
    announcement_status: announcement.status,
  })
}
