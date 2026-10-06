import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { fetchCodeRegistrations } from '@/app/lib/guest-invites/usage'

/* POST /api/events/guest-invites/usage   Body: { event_id }
   Refreshes, for every speaker of the event who has a guest link, how many guests have
   registered with their code — one read of KonfHub's attendee list (see usage.ts).
   READ-ONLY toward KonfHub. Stores guest_invite_used + guest_invite_usage_checked_at. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied

  const { data: web } = await supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', body.event_id).maybeSingle()
  if (!web?.konfhub_event_id || !web.konfhub_client_id || !web.konfhub_client_secret) return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 422 })
  const { data: speakers } = await supabaseAdmin.from('event_speakers').select('id, guest_invite_code').eq('event_id', body.event_id).not('guest_invite_code', 'is', null)
  if (!speakers?.length) return NextResponse.json({ checked: 0, results: [] })

  let counts
  try { counts = await fetchCodeRegistrations(web.konfhub_event_id, web.konfhub_client_id, web.konfhub_client_secret, { fresh: true }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read KonfHub registrations' }, { status: 502 }) }

  const now = new Date().toISOString()
  const results = []
  for (const s of speakers) {
    const used = (counts.get(s.guest_invite_code!) ?? []).length
    await supabaseAdmin.from('event_speakers').update({ guest_invite_used: used, guest_invite_usage_checked_at: now }).eq('id', s.id)
    results.push({ speaker_id: s.id, code: s.guest_invite_code, used })
  }
  return NextResponse.json({ checked: results.length, checked_at: now, results })
}
