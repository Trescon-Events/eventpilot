import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity, getSpeakerProducerId } from '@/app/lib/email/sender-identity'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

type ComposedCc = { name: string; email: string; review_token: string; subject: string; html: string }

/* POST /api/events/stakeholders/announcements/[id]/send-for-external-approval/send
   Body: { template_id, review_token, recipient_name, recipient_email,
           cc_recipients?: ComposedCc[], subject, html }
   review_token is the exact token compose/route.ts already baked into the
   {{review_url}} the producer previewed/edited — persisted here verbatim
   so the link in the sent email is guaranteed to match what was shown.

   Creates the announcement_approvals row (layer:'external') FIRST, before
   attempting the Graph send — same crash-safety ordering as send-to-speaker
   and internal send-for-approval (a mid-send crash leaves a retryable/
   inspectable row, not silence). Never touches stakeholder_announcements.
   status — that stays internal's own signal; the Publishing panel reads
   this round's readiness straight off this table (see checkCanPublish).
   Resending (e.g. wrong email) is allowed — the gating check always looks
   at the MOST RECENT external row for this announcement, so an older
   abandoned request doesn't stick around blocking anything.

   CC recipients (2026-09-22, per Madhu — "first responder wins," exact
   twin of send-for-client-approval/send's own CC handling) — each gets
   their own announcement_external_approval_cc row (own token, own status,
   linked to this send's main row via parent_approval_id) and their own
   SEPARATE email with their own link. A CC send failure doesn't fail the
   whole request or roll back the main send — each row's notified_at only
   gets stamped on actual success, same crash-safety principle as the main
   row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    template_id?: string; review_token?: string; recipient_name?: string; recipient_email?: string
    cc_recipients?: ComposedCc[]; subject?: string; html?: string
  } | null
  if (!body?.template_id || !body.review_token || !body.recipient_name?.trim() || !body.recipient_email?.trim() || !body.subject?.trim() || !body.html?.trim()) {
    return NextResponse.json({ error: 'template_id, review_token, recipient_name, recipient_email, subject, html required' }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('*').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', body.template_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const sender = await resolveSenderIdentity(session, template, await getSpeakerProducerId(announcement.speaker_id))

  const notifiedAt = new Date().toISOString()
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  const ccRecipients = (body.cc_recipients ?? []).filter(r => r.name?.trim() && r.email?.trim() && r.review_token && r.subject?.trim() && r.html?.trim())

  const { data: approvalRow, error: insertErr } = await supabaseAdmin
    .from('announcement_approvals')
    .insert({
      announcement_id: id,
      layer: 'external',
      approver_id: null,
      approver_role: 'External Reviewer',
      external_name: body.recipient_name,
      external_email: body.recipient_email,
      sent_by_name: sender.name,
      sent_by_email: sender.email,
      approval_token: body.review_token,
      token_expires_at: tokenExpiresAt,
      notified_at: notifiedAt,
    })
    .select()
    .single()
  if (insertErr || !approvalRow) return NextResponse.json({ error: insertErr?.message ?? 'Could not create approval record' }, { status: 500 })

  let ccRows: { id: string; name: string; email: string; approval_token: string; subject: string; html: string }[] = []
  if (ccRecipients.length > 0) {
    const { data: inserted, error: ccInsertErr } = await supabaseAdmin
      .from('announcement_external_approval_cc')
      .insert(ccRecipients.map(r => ({
        parent_approval_id: approvalRow.id, name: r.name, email: r.email, approval_token: r.review_token, token_expires_at: tokenExpiresAt,
      })))
      .select('id, name, email, approval_token')
    if (ccInsertErr) return NextResponse.json({ error: ccInsertErr.message }, { status: 500 })
    ccRows = (inserted ?? []).map(row => {
      const composed = ccRecipients.find(r => r.review_token === row.approval_token)!
      return { ...row, subject: composed.subject, html: composed.html }
    })
  }

  const results: { email: string; sent: boolean }[] = []

  try {
    await sendGraphMail({ senderEmail: sender.email, senderName: sender.name, to: body.recipient_email, subject: body.subject, html: body.html })
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'sent', sent_by: session!.sid,
    })
    results.push({ email: body.recipient_email, sent: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // The approval row stays — a producer can still share the review link
    // manually if the automated send failed, rather than losing the token.
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }

  for (const cc of ccRows) {
    try {
      await sendGraphMail({ senderEmail: sender.email, senderName: sender.name, to: cc.email, subject: cc.subject, html: cc.html })
      await supabaseAdmin.from('announcement_external_approval_cc').update({ notified_at: new Date().toISOString() }).eq('id', cc.id)
      await supabaseAdmin.from('email_template_sends').insert({
        template_id: body.template_id, send_type: 'live', to_email: cc.email, subject: cc.subject, status: 'sent', sent_by: session!.sid,
      })
      results.push({ email: cc.email, sent: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await supabaseAdmin.from('email_template_sends').insert({
        template_id: body.template_id, send_type: 'live', to_email: cc.email, subject: cc.subject, status: 'failed', error_message: message, sent_by: session!.sid,
      })
      results.push({ email: cc.email, sent: false })
    }
  }

  return NextResponse.json({ ok: true, approval_id: approvalRow.id, results })
}
