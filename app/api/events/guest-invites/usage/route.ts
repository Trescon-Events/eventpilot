import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { fetchKonfhubCodes } from '@/app/lib/guest-invites/codes'
import { loadKonfhubConfig } from '@/app/lib/guest-invites/sync'

/* POST /api/events/guest-invites/usage   Body: { event_id }
   Refreshes, for every speaker of the event who has a guest link, what KonfHub says about their
   code (places allotted, used, opening/expiry) — one read of KonfHub's code export for the whole
   event (~1 second). READ-ONLY toward KonfHub. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied

  const cfg = await loadKonfhubConfig(body.event_id)
  if (!cfg) return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 422 })
  const { data: speakers } = await supabaseAdmin.from('event_speakers').select('id, guest_invite_code').eq('event_id', body.event_id).not('guest_invite_code', 'is', null)
  if (!speakers?.length) return NextResponse.json({ checked: 0, results: [] })

  let codes
  try { codes = await fetchKonfhubCodes(cfg.konfhubEventId, cfg.clientId, cfg.clientSecret, cfg.tz, { fresh: true }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read KonfHub' }, { status: 502 }) }

  const now = new Date().toISOString()
  const results = []
  for (const s of speakers) {
    const info = codes.get(s.guest_invite_code!)
    await supabaseAdmin.from('event_speakers').update({
      guest_invite_code_found: !!info, guest_invite_ticket_name: info?.tickets.join(', ') || null, guest_invite_limit: info?.limit ?? null,
      guest_invite_used: info?.used ?? null, guest_invite_opens_at: info?.opensAt ?? null, guest_invite_expires_at: info?.expiresAt ?? null, guest_invite_usage_checked_at: now,
    }).eq('id', s.id)
    results.push({ speaker_id: s.id, code: s.guest_invite_code, found: !!info, limit: info?.limit ?? null, used: info?.used ?? null })
  }
  return NextResponse.json({ checked: results.length, checked_at: now, results })
}
