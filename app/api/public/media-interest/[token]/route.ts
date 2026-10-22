import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadMediaDays, loadSettings, prContactsFor, speakerBusyTimes, eventTimezone, notifyPrOfResponse } from '@/app/lib/pr/media-interest'
import { validateWindows } from '@/app/lib/pr/windows'

/* The speaker's private link for the media-interview request (no login — the token is the credential).
   GET: what the form needs (event, the days/hours PR opened, the speaker's own agenda sessions as busy, their current answer, who PR is).
   POST { interested: boolean, windows?: [{date, from, to}], note? }: records the answer (editable until the link expires) and tells PR. */

const noStore = { 'Cache-Control': 'no-store' }
const bad = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore })

async function load(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return { error: bad(404, 'This link is not valid.') }
  const { data: r } = await supabaseAdmin.from('media_interest_requests').select('*').eq('token', token).maybeSingle()
  if (!r) return { error: bad(404, 'This link is not valid.') }
  if (new Date(r.token_expires_at as string) < new Date()) return { error: bad(410, 'This link has expired. Please contact your event producer for a new one.') }
  const [{ data: s }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('name, public_name').eq('id', r.speaker_id).maybeSingle(),
    supabaseAdmin.from('events').select('name').eq('id', r.event_id).maybeSingle(),
  ])
  return { r, speakerName: ((s?.public_name as string) || (s?.name as string) || '').trim(), eventName: (ev?.name as string) ?? '' }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const l = await load(token); if ('error' in l) return l.error
  const { r } = l
  await supabaseAdmin.from('media_interest_requests').update({ last_opened_at: new Date().toISOString() }).eq('id', r.id)
  const [days, settings, pr, busy, tz] = await Promise.all([loadMediaDays(r.event_id), loadSettings(r.event_id), prContactsFor(r.event_id), speakerBusyTimes(r.event_id, r.speaker_id), eventTimezone(r.event_id)])
  return NextResponse.json({
    speaker_name: l.speakerName, event_name: l.eventName, timezone: tz, days, busy, intro: settings.intro,
    pr: pr.contacts.map(c => ({ name: c.name, role: c.role, email: c.email, phone: c.phone })),
    answer: r.status === 'pending' ? null : { interested: r.status === 'interested', windows: r.windows, note: r.note, submitted_at: r.submitted_at },
    expires_at: r.token_expires_at,
  }, { headers: noStore })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const l = await load(token); if ('error' in l) return l.error
  const { r } = l
  const body = await req.json().catch(() => null) as { interested?: boolean; windows?: unknown; note?: string } | null
  if (typeof body?.interested !== 'boolean') return bad(400, 'Please say whether you are open to media interviews.')
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  let windows: { date: string; from: string; to: string }[] = []
  if (body.interested) {
    const v = validateWindows(body.windows, await loadMediaDays(r.event_id))
    if (!v.ok) return bad(422, v.error)
    if (!v.windows.length) return bad(422, 'Please choose at least one time range, or say you are not available.')
    windows = v.windows
  }
  const status = body.interested ? 'interested' : 'declined'
  const changed = r.status !== 'pending'
  const { error } = await supabaseAdmin.from('media_interest_requests').update({ status, windows, note, submitted_at: new Date().toISOString() }).eq('id', r.id)
  if (error) return bad(500, 'Your answer could not be saved. Please try again.')
  await notifyPrOfResponse({ eventId: r.event_id, eventName: l.eventName, speakerName: l.speakerName, status, windows, note, changed })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
