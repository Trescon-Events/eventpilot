import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'

/* GET ?event_id=[&speaker_id=] — what was emailed (newest first, most recent 300). GET ?event_id=&send_id= — one sent email with its exact body. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const eventId = p.get('event_id'); if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  const sendId = p.get('send_id')
  if (sendId) {
    const { data } = await supabaseAdmin.from('speaker_email_sends').select('id, body_html, subject, to_email, cc_emails, sender_name, sender_email, status, error, created_at, batch:speaker_email_batches(attachments, polished)').eq('id', sendId).eq('event_id', eventId).maybeSingle()
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  let q = supabaseAdmin.from('speaker_email_sends').select('id, batch_id, speaker_id, subject, to_email, cc_emails, sender_name, status, error, created_at, speaker:event_speakers(name, public_name), batch:speaker_email_batches(polished, attachments)').eq('event_id', eventId).order('created_at', { ascending: false }).limit(300)
  const speakerId = p.get('speaker_id'); if (speakerId) q = q.eq('speaker_id', speakerId)
  const { data } = await q
  return NextResponse.json({ rows: (data ?? []).map(r => {
    const s = (Array.isArray(r.speaker) ? r.speaker[0] : r.speaker) as { name: string; public_name: string | null } | null
    const bt = (Array.isArray(r.batch) ? r.batch[0] : r.batch) as { polished: boolean; attachments: unknown[] } | null
    return { id: r.id, batch_id: r.batch_id, speaker_id: r.speaker_id, speaker: (s?.public_name || s?.name || '').trim(), subject: r.subject, to: r.to_email, cc: r.cc_emails, from: r.sender_name, status: r.status, error: r.error, sent_at: r.created_at, polished: !!bt?.polished, attachments: bt?.attachments?.length ?? 0 }
  }) })
}
