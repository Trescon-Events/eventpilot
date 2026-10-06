import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { composeGuestEmail } from '@/app/lib/guest-invites/send'

/* POST /api/events/stakeholders/speakers/[id]/guest-invite/compose   Body: { kind: 'invite' | 'reminder' }
   Renders the event's template for this speaker (stateless — nothing is sent). The code's limit and
   usage are read from KonfHub right now, so the email quotes the real number of places and a
   REMINDER reflects where they stand (none yet / N of M used). Refused if the code isn't on KonfHub,
   has no limit, is used up, or the registration deadline has passed. To = the speaker (or, with no
   email on file, their first Additional Contact); the other contacts are on Cc. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { kind?: string } | null
  if (body?.kind !== 'invite' && body?.kind !== 'reminder') return NextResponse.json({ error: 'kind must be invite or reminder' }, { status: 400 })

  const { data: s } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied

  const out = await composeGuestEmail(id, body.kind, getSession(req))
  if ('error' in out) return NextResponse.json({ error: out.error, ...out.extra }, { status: out.status })
  return NextResponse.json(out)
}
