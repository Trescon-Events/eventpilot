import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { parseGuestLink } from '@/app/lib/guest-invites/link'
import { loadEventGuestSettings } from '@/app/lib/guest-invites/template'
import { fetchCodeRegistrations } from '@/app/lib/guest-invites/usage'
import { syncSpeakerGuestCode, detailsFromRow, loadKonfhubConfig } from '@/app/lib/guest-invites/sync'

/* GET   /api/events/stakeholders/speakers/[id]/guest-invite[?refresh=1][&guests=1]
         This speaker's guest-invite state. The pass details (pass type, places allotted, used,
         available, opening/expiry) are what KonfHub says about the code, as last read.
         refresh=1 re-reads KonfHub first. guests=1 also lists who has registered (a slower
         read of KonfHub's attendee list).
   PATCH /api/events/stakeholders/speakers/[id]/guest-invite   Body: { link: string | null }
         Save / replace / clear the speaker's registration link (validated, code parsed, one code
         per speaker in an event). Saving reads the code from KonfHub straight away and returns its
         details and any warnings. Limits are never set here — the delegate team sets them on KonfHub. */

const COLS = 'id, event_id, name, public_name, guest_invite_url, guest_invite_code, guest_invite_code_found, guest_invite_ticket_name, guest_invite_limit, guest_invite_used, guest_invite_opens_at, guest_invite_expires_at, guest_invite_usage_checked_at, guest_invite_sent_at, guest_invite_sent_count, guest_invite_reminder_sent_at, guest_invite_reminder_count'
async function load(speakerId: string) {
  const { data } = await supabaseAdmin.from('event_speakers').select(COLS).eq('id', speakerId).maybeSingle()
  return data
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let s = await load(id)
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'view'); if (denied) return denied

  let warnings: string[] = []; let error: string | null = null
  const wantGuests = req.nextUrl.searchParams.get('guests') === '1'
  if ((req.nextUrl.searchParams.get('refresh') === '1' || wantGuests) && s.guest_invite_code) {
    try {
      const r = await syncSpeakerGuestCode(id, { fresh: true })
      if ('error' in r) error = r.error; else warnings = r.warnings
      s = (await load(id))!
    } catch (e) { error = e instanceof Error ? e.message : 'Could not read KonfHub.' }
  }

  let registrants: { name: string | null; email: string | null; registeredAt: string | null; ticket: string | null }[] | null = null
  if (wantGuests && s.guest_invite_code) {
    const cfg = await loadKonfhubConfig(s.event_id)
    if (cfg) { try { registrants = (await fetchCodeRegistrations(cfg.konfhubEventId, cfg.clientId, cfg.clientSecret)).get(s.guest_invite_code) ?? [] } catch (e) { error = error ?? (e instanceof Error ? e.message : 'Could not list registrations.') } }
  }
  const { settings } = await loadEventGuestSettings(s.event_id)
  return NextResponse.json({
    speaker: { id: s.id, name: s.public_name || s.name }, settings: { pass_name: settings.pass_name, deadline: settings.deadline },
    url: s.guest_invite_url, code: s.guest_invite_code, details: s.guest_invite_code ? detailsFromRow(s) : null, warnings, error, registrants,
    sent_at: s.guest_invite_sent_at, sent_count: s.guest_invite_sent_count, reminder_sent_at: s.guest_invite_reminder_sent_at, reminder_count: s.guest_invite_reminder_count,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await load(id)
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied
  const body = await req.json().catch(() => null) as { link?: string | null } | null
  if (!body || body.link === undefined) return NextResponse.json({ error: 'link required (or null to remove it)' }, { status: 400 })

  const clear = { guest_invite_url: null, guest_invite_code: null, guest_invite_code_found: null, guest_invite_ticket_name: null, guest_invite_limit: null, guest_invite_used: null, guest_invite_opens_at: null, guest_invite_expires_at: null, guest_invite_usage_checked_at: null }
  if (body.link === null || body.link.trim() === '') {
    await supabaseAdmin.from('event_speakers').update(clear).eq('id', id)
    return NextResponse.json({ ok: true, details: null, warnings: [] })
  }
  const p = parseGuestLink(body.link)
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
  const { data: clash } = await supabaseAdmin.from('event_speakers').select('id, public_name, name').eq('event_id', s.event_id).eq('guest_invite_code', p.code).neq('id', id).maybeSingle()
  if (clash) return NextResponse.json({ error: `That code already belongs to ${clash.public_name || clash.name}.` }, { status: 409 })

  const { error } = await supabaseAdmin.from('event_speakers').update({ ...(p.code !== s.guest_invite_code ? clear : {}), guest_invite_url: p.url, guest_invite_code: p.code }).eq('id', id)
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That code is already used by another speaker.' : error.message }, { status: error.code === '23505' ? 409 : 500 })

  // Read the code from KonfHub straight away — the link is saved either way; a KonfHub hiccup is reported, not fatal.
  try {
    const r = await syncSpeakerGuestCode(id, { fresh: true })
    if ('error' in r) return NextResponse.json({ ok: true, details: null, warnings: [], lookup_error: r.error })
    return NextResponse.json({ ok: true, details: r.details, warnings: r.warnings })
  } catch (e) {
    return NextResponse.json({ ok: true, details: null, warnings: [], lookup_error: `Link saved, but KonfHub couldn’t be reached (${e instanceof Error ? e.message : 'error'}). Use the refresh icon to try again.` })
  }
}
