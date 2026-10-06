import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { composeGuestEmail, sendGuestEmail } from '@/app/lib/guest-invites/send'
import { loadKonfhubConfig } from '@/app/lib/guest-invites/sync'
import { fetchKonfhubCodes } from '@/app/lib/guest-invites/codes'

/* POST /api/events/guest-invites/bulk-send
   Body: { event_id, kind: 'invite' | 'reminder', speaker_ids: string[], batch_id?: string, resend?: boolean }

   Sends the event's saved template (unedited) to each speaker as that speaker's producer, into their one
   thread — one at a time. Every speaker is re-validated here (never trusts the client's selection): the
   code is re-read from KonfHub (one export read for the whole batch), and anyone who can't be emailed is
   reported, not failed. An invite is skipped for speakers already invited unless `resend`. The client
   sends in chunks (MAX_PER_CALL) and passes the same batch_id so one run is one batch in the history. */
export const maxDuration = 60
const MAX_PER_CALL = 8

type Result = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string; to?: string; cc?: string[] }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; kind?: string; speaker_ids?: string[]; batch_id?: string; resend?: boolean } | null
  if (!body?.event_id || (body.kind !== 'invite' && body.kind !== 'reminder') || !Array.isArray(body.speaker_ids) || !body.speaker_ids.length) return NextResponse.json({ error: 'event_id, kind and speaker_ids are required' }, { status: 400 })
  if (body.speaker_ids.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} speakers per request.` }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied
  const session = getSession(req)
  const batchId = body.batch_id && /^[0-9a-f-]{36}$/i.test(body.batch_id) ? body.batch_id : randomUUID()
  const kind = body.kind

  const { data: sp } = await supabaseAdmin.from('event_speakers').select('id, event_id, guest_invite_sent_at').in('id', body.speaker_ids)
  const byId = new Map((sp ?? []).map(s => [s.id, s]))

  // One fresh read of the event's codes; the per-speaker compose below then hits the short cache instead of re-downloading.
  const cfg = await loadKonfhubConfig(body.event_id)
  if (!cfg) return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 422 })
  try { await fetchKonfhubCodes(cfg.konfhubEventId, cfg.clientId, cfg.clientSecret, cfg.tz, { fresh: true }) }
  catch (e) { return NextResponse.json({ error: `Couldn’t read KonfHub (${e instanceof Error ? e.message : 'error'}). Nothing was sent.` }, { status: 502 }) }

  const results: Result[] = []
  for (const id of body.speaker_ids) {
    const s = byId.get(id)
    if (!s || s.event_id !== body.event_id) { results.push({ id, status: 'skipped', reason: 'Not a speaker of this event' }); continue }
    if (kind === 'invite' && s.guest_invite_sent_at && !body.resend) { results.push({ id, status: 'skipped', reason: 'Already invited' }); continue }
    const c = await composeGuestEmail(id, kind, session, { fresh: false })
    if ('error' in c) { results.push({ id, status: 'skipped', reason: c.error }); continue }
    const r = await sendGuestEmail(id, kind, { to: c.recipient_email, cc: c.cc_emails, html: c.html, subject: c.subject }, session, { batchId, used: c.used, cap: c.cap })
    if ('error' in r) results.push({ id, status: 'failed', reason: r.errors?.length ? `${r.error} ${r.errors.map(e => e.message).join('; ')}` : r.error, to: c.recipient_email, cc: c.cc_emails })
    else results.push({ id, status: 'sent', to: c.recipient_email, cc: c.cc_emails })
    await new Promise(res => setTimeout(res, 400))
  }
  return NextResponse.json({ batch_id: batchId, results })
}
