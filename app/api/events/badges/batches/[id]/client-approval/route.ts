import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { knownStaffId, loadBatch, loadItems, requireBadgePermission } from '@/app/lib/badges/service'
import { TOKEN_TTL_MS, loadApprovalConfig, latestRound, newToken, pendingRound, reviewLink, sendApprovalEmail, senderFor, type RecipientRow } from '@/app/lib/badges/client-approval'

/* The producer's side of client approval for speaker badges (2026-10-21).
   GET   .../batches/[id]/client-approval   the event's setting + approvers, the latest round and who it went to (sae.badges.view)
   POST  .../batches/[id]/client-approval { action: 'send', message? } | { action: 'remind', recipient_id? } | { action: 'withdraw' }   (sae.badges.approve)
   'send' needs the batch approved internally; every approver gets their OWN private link; any one of them settles the round. */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.view')
  if ('error' in auth) return auth.error
  const cfg = await loadApprovalConfig(batch.event_id)
  const round = await latestRound(id)
  const { data: recipients } = round ? await supabaseAdmin.from('badge_approval_recipients').select('id, name, email, notified_at, reminder_count, last_reminder_at, last_opened_at, token_expires_at').eq('round_id', round.id) : { data: [] }
  return NextResponse.json({
    required: cfg.required, contacts: cfg.contacts.map(c => ({ name: c.name, email: c.email })), contacts_from: cfg.contacts_from,
    round, recipients: recipients ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.approve')
  if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null) as { action?: string; message?: string; recipient_id?: string } | null
  const staffId = await knownStaffId(auth.session.sid)
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', batch.event_id).single()
  const eventName = (ev?.public_name as string | null) || (ev?.name as string | null) || 'the event'

  if (body?.action === 'send') {
    const cfg = await loadApprovalConfig(batch.event_id)
    if (!cfg.required) return NextResponse.json({ error: 'Client approval isn’t switched on for this event.' }, { status: 409 })
    if (cfg.contacts.length === 0) return NextResponse.json({ error: 'No client approvers are set up yet. Add them under Integrations › Client Approval — Badges (or on the umbrella’s Event Details page).' }, { status: 409 })
    if (batch.status !== 'approved') return NextResponse.json({ error: 'Approve every badge and approve the batch first, then send it to the client.' }, { status: 409 })
    if (await pendingRound(id)) return NextResponse.json({ error: 'This batch is already with the client.' }, { status: 409 })
    const live = (await loadItems(id)).filter(i => !i.removed)
    if (live.length === 0) return NextResponse.json({ error: 'The batch has no badges.' }, { status: 409 })

    const sender = await senderFor(auth.session.sid)
    const message = body.message?.trim().slice(0, 1000) || null
    const { data: round, error } = await supabaseAdmin.from('badge_approval_rounds').insert({
      batch_id: id, message, badges: live.length, sent_by: staffId, sent_by_name: sender.name, sent_by_email: sender.email,
    }).select('*').single()
    if (error || !round) return NextResponse.json({ error: error?.message ?? 'Could not start the approval.' }, { status: 500 })
    const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    const { data: recipients, error: recErr } = await supabaseAdmin.from('badge_approval_recipients')
      .insert(cfg.contacts.map(c => ({ round_id: round.id, name: c.name, email: c.email, token: newToken(), token_expires_at: expires }))).select('*')
    if (recErr || !recipients) { await supabaseAdmin.from('badge_approval_rounds').delete().eq('id', round.id); return NextResponse.json({ error: recErr?.message ?? 'Could not create the links.' }, { status: 500 }) }

    // Rows exist before any email goes out, so a failed send still leaves usable links.
    const results: { email: string; sent: boolean }[] = []
    for (const r of recipients as RecipientRow[]) {
      const sent = await sendApprovalEmail({ to: r.email, recipientName: r.name, eventName, batchName: batch.name, badges: live.length, token: r.token, sender, message })
      if (sent) await supabaseAdmin.from('badge_approval_recipients').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
      results.push({ email: r.email, sent })
    }
    await logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: staffId, action: 'badge_client_approval_sent', targetType: 'badge_batch', targetId: id, meta: { round_id: round.id, recipients: results }, ip: clientIp(req) })
    return NextResponse.json({ ok: true, round_id: round.id, results })
  }

  if (body?.action === 'remind') {
    const round = await pendingRound(id)
    if (!round) return NextResponse.json({ error: 'There is no round waiting for the client.' }, { status: 409 })
    let q = supabaseAdmin.from('badge_approval_recipients').select('*').eq('round_id', round.id)
    if (body.recipient_id) q = q.eq('id', body.recipient_id)
    const { data: recipients } = await q
    const sender = await senderFor(auth.session.sid)
    const results: { email: string; sent: boolean }[] = []
    for (const r of (recipients ?? []) as RecipientRow[]) {
      const sent = await sendApprovalEmail({ to: r.email, recipientName: r.name, eventName, batchName: batch.name, badges: round.badges, token: r.token, sender, message: round.message, reminder: true })
      if (sent) await supabaseAdmin.from('badge_approval_recipients').update({ reminder_count: r.reminder_count + 1, last_reminder_at: new Date().toISOString() }).eq('id', r.id)
      results.push({ email: r.email, sent })
    }
    return NextResponse.json({ ok: true, results })
  }

  if (body?.action === 'withdraw') {
    const round = await pendingRound(id)
    if (!round) return NextResponse.json({ error: 'There is no round waiting for the client.' }, { status: 409 })
    await supabaseAdmin.from('badge_approval_rounds').update({ status: 'withdrawn', resolved_at: new Date().toISOString() }).eq('id', round.id).eq('status', 'pending')
    await logOpsAccess({ eventId: batch.event_id, actorType: 'staff', actorId: staffId, action: 'badge_client_approval_withdrawn', targetType: 'badge_batch', targetId: id, meta: { round_id: round.id }, ip: clientIp(req) })
    return NextResponse.json({ ok: true })
  }

  void reviewLink
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
