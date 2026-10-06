import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { loadEventGuestSettings } from '@/app/lib/guest-invites/template'

/* GET/PUT /api/events/guest-invites/settings?event_id=X
   Per-event guest-invite settings: the pass name ("Conference Pass") and the registration
   deadline. The number of guests per speaker is NOT set here — it is read from each speaker's
   code on KonfHub, where the delegate team sets it. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  return NextResponse.json((await loadEventGuestSettings(eventId)).settings)
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  const body = await req.json().catch(() => null) as { pass_name?: string; deadline?: string | null } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.pass_name !== undefined) {
    const n = body.pass_name.trim()
    if (!n) return NextResponse.json({ error: 'Pass name can’t be empty.' }, { status: 400 })
    patch.guest_invite_pass_name = n
  }
  if (body.deadline !== undefined) {
    if (body.deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return NextResponse.json({ error: 'Deadline must be a date (YYYY-MM-DD).' }, { status: 400 })
    patch.guest_invite_deadline = body.deadline
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('events').update(patch).eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((await loadEventGuestSettings(eventId)).settings)
}
