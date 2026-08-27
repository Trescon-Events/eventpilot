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

  const { data: approval } = await supabaseAdmin
    .from('announcement_approvals')
    .select('approver_role, token_expires_at, status, notified_at, layer, external_name, sent_by_name, approver:approver_id(name)')
    .eq('announcement_id', id)
    .eq('approval_token', token)
    .single()

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
    approver_role: approval.layer === 'external' ? 'External Reviewer' : approval.approver_role,
    approval_status: approval.status,
    post_copy: announcement.post_copy,
    creative_url: announcement.creative_url,
    platforms: announcement.platforms,
    scheduled_for: announcement.scheduled_for,
    announcement_status: announcement.status,
  })
}
