import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { locateApprovalToken, resolveRoundForLocated } from '@/app/lib/events/approval-round'

/* GET /api/events/stakeholders/announcements/[id]/review-data?token=X
   Public (see middleware.ts), read-only. Deliberately a separate, narrow
   endpoint rather than widening access on the general announcement CRUD
   route — a token only ever unlocks exactly what an approver needs to see
   (creative, copy, platforms, who sent it), nothing else.

   First-responder-wins (2026-09-22, per Madhu) — for external/client,
   this now resolves the whole ROUND (the main row + every CC row tied to
   it — see approval-round.ts), not just the one row this specific token
   happens to be. A CC'd viewer opening their own still-pending link after
   a sibling (main or another CC) already responded sees that sibling's
   decision immediately, same as if it were their own row. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const located = await locateApprovalToken(id, token)
  if (!located) return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
  if (!located.token_expires_at || new Date(located.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  // 'internal' has no round concept (aggregate-all-approvers, unchanged —
  // see approve/route.ts) — read its one row directly, same as before.
  let approverRole: string
  let sentByName: string | null
  let approvalStatus: string
  let decisionComments: string | null
  let decisionActionedAt: string | null
  let notifiedAt: string | null
  let approverName: string | null
  let approverEmail: string | null
  let isSecondaryRecipient = false

  if (located.layer === 'internal') {
    const { data: row } = await supabaseAdmin
      .from('announcement_approvals')
      .select('approver_role, status, notified_at, actioned_at, comments, sent_by_name, approver:approver_id(name, email)')
      .eq('id', located.id)
      .single()
    if (!row) return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
    const approver = Array.isArray(row.approver) ? row.approver[0] : row.approver
    approverRole = row.approver_role
    sentByName = row.sent_by_name
    approvalStatus = row.status
    decisionComments = row.comments
    decisionActionedAt = row.actioned_at
    notifiedAt = row.notified_at
    approverName = approver?.name ?? null
    approverEmail = approver?.email ?? null
  } else {
    const parentId = located.kind === 'main' ? located.id : located.parent_approval_id
    const [{ data: main }, resolution] = await Promise.all([
      supabaseAdmin.from('announcement_approvals').select('sent_by_name').eq('id', parentId).single(),
      resolveRoundForLocated(parentId, located.layer),
    ])
    approverRole = located.layer === 'external' ? 'External Reviewer' : 'Client Reviewer'
    sentByName = main?.sent_by_name ?? null
    approvalStatus = resolution.status
    decisionComments = resolution.comments
    decisionActionedAt = resolution.actioned_at
    notifiedAt = resolution.notified_at
    approverName = resolution.resolved_by_name
    approverEmail = resolution.resolved_by_email
    // Still meaningful while status is 'pending' — the page uses this to
    // tell a not-yet-resolved viewer that others can also act on this
    // request, so if it shows resolved next time they check, that's why.
    isSecondaryRecipient = located.kind === 'cc'
  }

  const { data: announcement } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('post_copy, creative_url, platforms, scheduled_for, status, event:event_id(name), creator:created_by(name)')
    .eq('id', id)
    .single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const event   = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event
  const creator = Array.isArray(announcement.creator) ? announcement.creator[0] : announcement.creator

  return NextResponse.json({
    event_name: event?.name ?? null,
    sent_by: sentByName ?? creator?.name ?? null,
    sent_at: notifiedAt,
    approver_name: approverName,
    approver_email: approverEmail,
    approver_role: approverRole,
    // Renamed from is_client_cc (2026-09-22) — now applies to either
    // layer, and no longer implies "informational only" (see
    // approval-round.ts's doc comment: whoever resolves first counts).
    is_secondary_recipient: isSecondaryRecipient,
    approval_status: approvalStatus,
    decision_comments: decisionComments,
    decision_actioned_at: decisionActionedAt,
    post_copy: announcement.post_copy,
    creative_url: announcement.creative_url,
    platforms: announcement.platforms,
    scheduled_for: announcement.scheduled_for,
    announcement_status: announcement.status,
  })
}
