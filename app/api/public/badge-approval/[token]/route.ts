import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { approvalOutcome, notifyProducerOfOutcome, type RoundRow } from '@/app/lib/badges/client-approval'

/* The client's side of badge approval (2026-10-21) — public (see middleware.ts's /api/public prefix), reachable only with a recipient's private token.
   GET   /api/public/badge-approval/[token]   the gallery data: every badge, this person's saved comments/rejections, and — once somebody has acted —
                                              who acted and what they decided (read-only for everyone else)
   POST  /api/public/badge-approval/[token]   { action: 'save', item_id, comment?, rejected? }   saves one badge's comment / rejection (while still open)
                                              { action: 'submit' }                                 approves the batch. The FIRST person to submit settles the
                                              round; their decisions become the batch's. Anyone else is told who already acted. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function load(token: string) {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return null
  const { data: rec } = await supabaseAdmin.from('badge_approval_recipients').select('*').eq('token', token).maybeSingle()
  if (!rec) return null
  const { data: round } = await supabaseAdmin.from('badge_approval_rounds').select('*').eq('id', rec.round_id).maybeSingle()
  if (!round) return null
  const { data: batch } = await supabaseAdmin.from('badge_batches').select('id, name, event_id, template_snapshot, quantity').eq('id', round.batch_id).maybeSingle()
  if (!batch) return null
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', batch.event_id).maybeSingle()
  return { rec, round: round as RoundRow, batch, eventName: ((ev?.public_name as string | null) || (ev?.name as string | null) || 'the event') }
}

/** What to tell someone whose link no longer leads anywhere. A batch that was deleted leaves a note (see the batch DELETE), so the message can say what happened. */
async function missingLinkMessage(token: string): Promise<string> {
  const generic = 'This approval link is no longer active. The badges it belonged to may have been replaced or removed, or the link was copied incompletely. Please ask the sender for the current link.'
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return generic
  const { data } = await supabaseAdmin.from('badge_approval_closed_links').select('batch_name, event_name, sent_by_name').eq('token', token).maybeSingle()
  if (!data) return generic
  return `This approval request is no longer active: the badges “${data.batch_name ?? ''}”${data.event_name ? ` for ${data.event_name}` : ''} were replaced or removed by ${data.sent_by_name ?? 'the sender'}. Nothing more is needed from you on this link — a new link will be sent if your approval is still required.`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await load(token)
  if (!ctx) return NextResponse.json({ error: await missingLinkMessage(token) }, { status: 404 })
  const { rec, round, batch, eventName } = ctx
  if (round.status === 'withdrawn') return NextResponse.json({ error: 'This approval request was withdrawn by the sender. They will send a new link if needed.' }, { status: 410 })
  if (round.status === 'pending' && new Date(rec.token_expires_at as string) < new Date()) return NextResponse.json({ error: 'This link has expired. Please ask the sender for a new one.' }, { status: 410 })
  await supabaseAdmin.from('badge_approval_recipients').update({ last_opened_at: new Date().toISOString() }).eq('id', rec.id)

  const { data: all } = await supabaseAdmin.from('badge_batch_items').select('id, name, title, company, preview_url, removed, client_rejected, client_comment, position').eq('batch_id', batch.id).order('position', { ascending: true })
  const pending = round.status === 'pending'
  const items = (all ?? []).filter(i => pending ? !i.removed : (!i.removed || i.client_rejected))
  // Whose decisions are shown: your own while it is open; the person who settled it afterwards.
  const { data: settler } = !pending && round.resolved_by_email ? await supabaseAdmin.from('badge_approval_recipients').select('id').eq('round_id', round.id).ilike('email', round.resolved_by_email).maybeSingle() : { data: null }
  const viewId = pending ? (rec.id as string) : (settler?.id as string | undefined)
  const { data: decisions } = viewId ? await supabaseAdmin.from('badge_approval_decisions').select('item_id, comment, rejected').eq('recipient_id', viewId) : { data: [] }
  const byItem = new Map((decisions ?? []).map(d => [d.item_id as string, d]))
  const snap = batch.template_snapshot as { canvas_width?: number; canvas_height?: number } | null
  return NextResponse.json({
    event_name: eventName, batch_name: batch.name, quantity: (batch.quantity as number | null) ?? null, sent_by_name: round.sent_by_name, sent_at: round.sent_at, message: round.message, recipient_name: rec.name,
    canvas: { width: snap?.canvas_width ?? 1, height: snap?.canvas_height ?? 1 },
    status: round.status,
    resolved: pending ? null : { by_name: round.resolved_by_name, at: round.resolved_at, status: round.status, rejected_count: round.rejected_count, comment_count: round.comment_count, note: round.client_note ?? null, is_me: !!round.resolved_by_email && round.resolved_by_email.toLowerCase() === String(rec.email).toLowerCase() },
    items: items.map(i => ({ id: i.id, name: i.name, title: i.title, company: i.company, preview_url: i.preview_url, comment: byItem.get(i.id as string)?.comment ?? null, rejected: !!byItem.get(i.id as string)?.rejected })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await load(token)
  if (!ctx) return NextResponse.json({ error: await missingLinkMessage(token) }, { status: 404 })
  const { rec, round, batch, eventName } = ctx
  if (round.status === 'withdrawn') return NextResponse.json({ error: 'This approval request was withdrawn by the sender.' }, { status: 410 })
  if (round.status !== 'pending') return NextResponse.json({ error: `${round.resolved_by_name ?? 'A colleague'} has already responded to this request.`, already_actioned: true }, { status: 409 })
  if (new Date(rec.token_expires_at as string) < new Date()) return NextResponse.json({ error: 'This link has expired. Please ask the sender for a new one.' }, { status: 410 })

  const body = await req.json().catch(() => null) as { action?: string; item_id?: string; comment?: string | null; rejected?: boolean; note?: string | null } | null

  if (body?.action === 'save') {
    if (!body.item_id || !UUID.test(body.item_id)) return NextResponse.json({ error: 'item_id required.' }, { status: 400 })
    const { data: item } = await supabaseAdmin.from('badge_batch_items').select('id').eq('id', body.item_id).eq('batch_id', batch.id).eq('removed', false).maybeSingle()
    if (!item) return NextResponse.json({ error: 'That badge isn’t part of this request.' }, { status: 404 })
    const { data: cur } = await supabaseAdmin.from('badge_approval_decisions').select('comment, rejected').eq('recipient_id', rec.id).eq('item_id', body.item_id).maybeSingle()
    const comment = body.comment === undefined ? (cur?.comment ?? null) : ((body.comment ?? '').trim().slice(0, 1000) || null)
    const rejected = body.rejected === undefined ? !!cur?.rejected : !!body.rejected
    if (!comment && !rejected) await supabaseAdmin.from('badge_approval_decisions').delete().eq('recipient_id', rec.id).eq('item_id', body.item_id)
    else await supabaseAdmin.from('badge_approval_decisions').upsert({ round_id: round.id, recipient_id: rec.id, item_id: body.item_id, comment, rejected, updated_at: new Date().toISOString() }, { onConflict: 'recipient_id,item_id' })
    return NextResponse.json({ ok: true })
  }

  if (body?.action === 'submit') {
    const { data: mine } = await supabaseAdmin.from('badge_approval_decisions').select('item_id, comment, rejected').eq('recipient_id', rec.id)
    const decisions = (mine ?? []) as { item_id: string; comment: string | null; rejected: boolean }[]
    const note = ((body.note ?? '') as string).trim().slice(0, 2000) || null
    const outcome = approvalOutcome(decisions, note)
    const rejected = decisions.filter(d => d.rejected)
    const commented = decisions.filter(d => (d.comment ?? '').trim())
    // Conditional update: only one person can settle the round.
    const { data: won } = await supabaseAdmin.from('badge_approval_rounds')
      .update({ status: outcome, resolved_at: new Date().toISOString(), resolved_by_name: rec.name, resolved_by_email: rec.email, rejected_count: rejected.length, comment_count: commented.length, client_note: note })
      .eq('id', round.id).eq('status', 'pending').select('id')
    if (!won?.length) {
      const { data: now } = await supabaseAdmin.from('badge_approval_rounds').select('resolved_by_name').eq('id', round.id).single()
      return NextResponse.json({ error: `${now?.resolved_by_name ?? 'A colleague'} has already responded to this request.`, already_actioned: true }, { status: 409 })
    }
    // Their decisions become the batch's: rejected badges leave the print file, comments sit on the badge for the producer.
    for (const d of rejected) await supabaseAdmin.from('badge_batch_items').update({ removed: true, client_rejected: true, approved: false, client_comment: (d.comment ?? '').trim() || null }).eq('id', d.item_id).eq('batch_id', batch.id)
    for (const d of commented.filter(c => !c.rejected)) await supabaseAdmin.from('badge_batch_items').update({ client_comment: d.comment!.trim() }).eq('id', d.item_id).eq('batch_id', batch.id)
    await notifyProducerOfOutcome({ ...round, status: outcome } as RoundRow, { eventId: batch.event_id as string, eventName, batchName: batch.name as string, batchId: batch.id as string }, { by: rec.name as string, status: outcome, rejected: rejected.length, comments: commented.length, note })
    return NextResponse.json({ ok: true, status: outcome, rejected: rejected.length, comments: commented.length })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
