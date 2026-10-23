import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { polishEmail } from '@/app/lib/speaker-emails/polish'

/* POST { event_id, body_html, speaker_ids? } — rewrites the producer's draft to the event's guidelines and house email style. Stateless: nothing is saved or sent. */
export const maxDuration = 90
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; body_html?: string; speaker_ids?: string[] } | null
  if (!body?.event_id || typeof body.body_html !== 'string') return NextResponse.json({ error: 'event_id and body_html are required' }, { status: 400 })
  if (body.body_html.length > 40_000) return NextResponse.json({ error: 'That draft is too long to polish.' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied
  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', body.event_id).maybeSingle()
  let styles: string[] = []
  if (body.speaker_ids?.length) {
    const { data } = await supabaseAdmin.from('event_speakers').select('pronoun_style').eq('event_id', body.event_id).in('id', body.speaker_ids.slice(0, 500))
    styles = (data ?? []).map(r => r.pronoun_style as string | null).filter((p): p is string => !!p)
  }
  const r = await polishEmail({ eventId: body.event_id, eventName: (event?.public_name || event?.name || 'the event') as string, bodyHtml: body.body_html, pronounStyles: styles })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 502 })
  return NextResponse.json(r)
}
