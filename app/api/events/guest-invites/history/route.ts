import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'

/* GET /api/events/guest-invites/history?event_id=X[&speaker_id=Y]
   The send log (newest first, max 300): every invite / reminder sent or failed, single or bulk. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  let q = supabaseAdmin.from('guest_invite_sends').select('id, speaker_id, kind, to_email, cc_emails, status, error, used_at_send, limit_at_send, bulk_batch_id, sent_by, created_at').eq('event_id', eventId).order('created_at', { ascending: false }).limit(300)
  const speakerId = req.nextUrl.searchParams.get('speaker_id')
  if (speakerId) q = q.eq('speaker_id', speakerId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sends: data ?? [] })
}
