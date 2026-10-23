import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { checkEmailCompliance, htmlToPlainText } from '@/app/lib/guest-invites/template'
import { parseExtraCc } from '@/app/lib/email/extra-cc'
import { attachmentProblem, cleanBodyHtml, hasContent, type SpeakerAttachment } from '@/app/lib/speaker-emails/render'
import { attachmentUrlOk, loadAttachmentBytes, sendSpeakerEmail, type SendOne } from '@/app/lib/speaker-emails/server'

/* POST { event_id, speaker_ids (≤8), body_html, batch_id?, polished?, original_html?, attachments? } — sends the email to each speaker as that speaker's producer, one at a time.
   The first call (no batch_id) creates the batch record and returns its id; the client sends the rest of a long list in further calls with that id. Content rules are re-checked
   here — an error-level finding blocks the whole call, so a non-compliant email never leaves. */
export const maxDuration = 60
const MAX_PER_CALL = 8

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { event_id?: string; speaker_ids?: string[]; body_html?: string; batch_id?: string; polished?: boolean; original_html?: string; attachments?: SpeakerAttachment[]; extra_cc?: string[] } | null
  if (!b?.event_id || !Array.isArray(b.speaker_ids) || !b.speaker_ids.length || typeof b.body_html !== 'string') return NextResponse.json({ error: 'event_id, speaker_ids and body_html are required' }, { status: 400 })
  if (b.speaker_ids.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} speakers per request.` }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, b.event_id, 'edit'); if (denied) return denied
  const session = getSession(req)
  const extra = parseExtraCc(b.extra_cc ?? []); if ('error' in extra) return NextResponse.json({ error: extra.error }, { status: 400 })
  const bodyHtml = cleanBodyHtml(b.body_html)
  if (!hasContent(bodyHtml)) return NextResponse.json({ error: 'The email is empty.' }, { status: 422 })

  const attachments = Array.isArray(b.attachments) ? b.attachments : []
  const problem = attachmentProblem(attachments)
  if (problem) return NextResponse.json({ error: problem }, { status: 422 })
  if (attachments.some(a => !attachmentUrlOk(b.event_id!, a.url))) return NextResponse.json({ error: 'An attachment is not one uploaded here — remove it and add it again.' }, { status: 422 })

  const { errors, warnings } = await checkEmailCompliance(b.event_id, htmlToPlainText(bodyHtml))
  const f = (x: { message: string; match: string }) => ({ message: x.message, match: x.match })
  if (errors.length) return NextResponse.json({ error: 'The email breaks the event’s content rules.', errors: errors.map(f), warnings: warnings.map(f) }, { status: 422 })

  let batchId = b.batch_id
  if (!batchId) {
    const { data: batch, error } = await supabaseAdmin.from('speaker_email_batches').insert({
      event_id: b.event_id, created_by: session?.sid ?? null, body_html: bodyHtml, polished: !!b.polished, original_html: b.polished ? (b.original_html ?? null) : null, attachments,
    }).select('id').single()
    if (error || !batch) return NextResponse.json({ error: 'Could not start the send.' }, { status: 500 })
    batchId = batch.id as string
  }

  let files: Awaited<ReturnType<typeof loadAttachmentBytes>> = []
  try { files = await loadAttachmentBytes(attachments) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read an attachment.' }, { status: 422 }) }

  const results: SendOne[] = []
  for (const id of b.speaker_ids) {
    results.push(await sendSpeakerEmail({ eventId: b.event_id, batchId, speakerId: id, bodyHtml, attachments: files, session, extraCc: extra.emails }))
    await new Promise(r => setTimeout(r, 400))
  }
  return NextResponse.json({ batch_id: batchId, results, warnings: warnings.map(f) })
}
