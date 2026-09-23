import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { resolveApprovalRound } from '@/app/lib/events/approval-round'

/* GET /api/events/stakeholders/announcements?event_id=X&status=Y&month=YYYY-MM&speaker_id=Z&partner_id=Z
   Lists announcements for the social calendar (PRD SS6.11/9.7), Queue, and
   any other "announcements for this event" view. month filters on
   scheduled_for falling within that calendar month. speaker_id/partner_id
   scope to one stakeholder's announcements (the Stakeholder Hub detail
   page's Announcements tab, 2026-08-18 SAE-into-Hub merge). */
export async function GET(req: NextRequest) {
  const eventId   = req.nextUrl.searchParams.get('event_id')
  const status    = req.nextUrl.searchParams.get('status')
  const month     = req.nextUrl.searchParams.get('month') // YYYY-MM
  const speakerId = req.nextUrl.searchParams.get('speaker_id')
  const partnerId = req.nextUrl.searchParams.get('partner_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, stakeholder_type, speaker_id, partner_id, post_copy, post_copy_x, creative_url, creative_variant_id, status, created_at, scheduled_for, platforms, published_at, postiz_channel_ids, publish_results, announcement_kind, internal_approval_bypassed_at, external_approval_bypassed_at, client_approval_bypassed_at, tagging_confirmed_at, internal_notified_at, internal_notification_reminder_count, internal_notification_last_sent_at, external_notified_at, external_notification_reminder_count, external_notification_last_sent_at, external_notification_recipient_name, external_notification_recipient_email')
    .eq('event_id', eventId)
    .order('scheduled_for', { ascending: true, nullsFirst: false })

  if (status) q = q.eq('status', status)
  if (speakerId) q = q.eq('speaker_id', speakerId)
  if (partnerId) q = q.eq('partner_id', partnerId)
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01T00:00:00.000Z`
    const [y, m] = month.split('-').map(Number)
    const endDate = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
    q = q.gte('scheduled_for', start).lt('scheduled_for', endDate.toISOString())
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach a display name for calendar dots without a second round trip per row.
  const speakerIds = (data ?? []).filter(a => a.speaker_id).map(a => a.speaker_id!)
  const partnerIds = (data ?? []).filter(a => a.partner_id).map(a => a.partner_id!)

  const [{ data: speakers }, { data: partners }] = await Promise.all([
    speakerIds.length ? supabaseAdmin.from('event_speakers').select('id, name').in('id', speakerIds) : Promise.resolve({ data: [] }),
    partnerIds.length ? supabaseAdmin.from('event_sponsors').select('id, name').in('id', partnerIds) : Promise.resolve({ data: [] }),
  ])
  const speakerNames = new Map((speakers ?? []).map(s => [s.id, s.name]))
  const partnerNames = new Map((partners ?? []).map(p => [p.id, p.name]))

  // Two-layer approval (2026-08-26), extended to three (2026-08-29) —
  // external_approval_status and client_approval_status are both derived
  // from the MOST RECENT layer='external'/'client' announcement_approvals
  // row per announcement (a resend after e.g. a wrong email creates a new
  // row; the Publishing panel's readiness check should only ever look at
  // the latest one), not stored as their own columns, so there's nothing to
  // keep in sync if the approvals table changes. 'none' — never sent,
  // doesn't block anything (existing internal-only announcements, or
  // events with no Client Approval contact configured, are unaffected).
  //
  // First-responder-wins (2026-09-22) — each layer's status/comments/
  // actioned_at/recipient now reflect the whole ROUND's resolution (the
  // main row OR any CC's — see approval-round.ts's own doc comment for
  // why), not just the main row read in isolation. Batched here (one
  // query per table across every announcement on the page) rather than
  // calling fetchAndResolveApprovalRound() per row, which would be N+1.
  const announcementIds = (data ?? []).map(a => a.id)
  type MainDetail = { id: string; status: string; comments: string | null; actioned_at: string | null; notified_at: string | null; external_name: string | null; external_email: string | null }
  const externalMainById = new Map<string, MainDetail>()
  const clientMainById = new Map<string, MainDetail>()
  if (announcementIds.length > 0) {
    const { data: layeredApprovals } = await supabaseAdmin
      .from('announcement_approvals')
      .select('id, announcement_id, layer, status, comments, actioned_at, notified_at, external_name, external_email')
      .in('announcement_id', announcementIds)
      .in('layer', ['external', 'client'])
      .order('created_at', { ascending: false })
    for (const row of layeredApprovals ?? []) {
      const byId = row.layer === 'external' ? externalMainById : clientMainById
      if (!byId.has(row.announcement_id)) byId.set(row.announcement_id, row)
    }
  }

  const externalMainIds = [...externalMainById.values()].map(r => r.id)
  const clientMainIds = [...clientMainById.values()].map(r => r.id)
  type CcDetail = { parent_approval_id: string; status: string; comments: string | null; actioned_at: string | null; name: string | null; email: string | null }
  const [{ data: externalCc }, { data: clientCc }] = await Promise.all([
    externalMainIds.length
      ? supabaseAdmin.from('announcement_external_approval_cc').select('parent_approval_id, status, comments, actioned_at, name, email').in('parent_approval_id', externalMainIds)
      : Promise.resolve({ data: [] as CcDetail[] }),
    clientMainIds.length
      ? supabaseAdmin.from('announcement_client_approval_cc').select('parent_approval_id, status, comments, actioned_at, name, email').in('parent_approval_id', clientMainIds)
      : Promise.resolve({ data: [] as CcDetail[] }),
  ])
  const ccByParent = (rows: CcDetail[] | null) => {
    const m = new Map<string, CcDetail[]>()
    for (const row of rows ?? []) m.set(row.parent_approval_id, [...(m.get(row.parent_approval_id) ?? []), row])
    return m
  }
  const externalCcByParent = ccByParent(externalCc)
  const clientCcByParent = ccByParent(clientCc)

  const enriched = (data ?? []).map(a => {
    const externalMain = externalMainById.get(a.id) ?? null
    const clientMain = clientMainById.get(a.id) ?? null
    const external = resolveApprovalRound(externalMain, externalMain ? (externalCcByParent.get(externalMain.id) ?? []) : [])
    const client = resolveApprovalRound(clientMain, clientMain ? (clientCcByParent.get(clientMain.id) ?? []) : [])
    return {
      ...a,
      stakeholder_name: a.speaker_id ? speakerNames.get(a.speaker_id) : a.partner_id ? partnerNames.get(a.partner_id) : null,
      external_approval_status: external.status,
      external_approval_comments: external.comments,
      external_approval_actioned_at: external.actioned_at,
      external_approval_recipient: externalMain?.external_name ?? null,
      external_approval_resolved_by: external.resolved_by_name,
      external_approval_notified_at: external.notified_at,
      client_approval_status: client.status,
      client_approval_comments: client.comments,
      client_approval_actioned_at: client.actioned_at,
      client_approval_recipient: clientMain?.external_name ?? null,
      client_approval_resolved_by: client.resolved_by_name,
      client_approval_notified_at: client.notified_at,
    }
  })

  return NextResponse.json(enriched)
}
