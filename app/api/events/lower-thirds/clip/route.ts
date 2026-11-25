import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { presignGet } from '@/app/lib/session-videos/storage'
import { generateLowerThirdStill, enqueueLowerThirdJob } from '@/app/lib/lower-thirds/service'
import { requireLowerThirdAccess, UUID_RE } from '@/app/lib/lower-thirds/access'

/* The exact final clip for one speaker (made by the video worker), for the last check.
   POST { event_id, speaker_id } — queue it (uses the speaker's first session; the clip is the same for any session)
   GET  ?event_id&speaker_id     — status + a playable link once it exists */

async function sessionFor(eventId: string, speakerId: string): Promise<string | null> {
  const { data: links } = await supabaseAdmin.from('event_agenda_session_speakers').select('session_id').eq('speaker_id', speakerId)
  const ids = (links ?? []).map(l => l.session_id as string)
  if (!ids.length) return null
  const { data } = await supabaseAdmin.from('event_agenda_sessions').select('id').eq('event_id', eventId).in('id', ids).limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const eventId = typeof b.event_id === 'string' ? b.event_id : '', speakerId = typeof b.speaker_id === 'string' ? b.speaker_id : ''
  if (!UUID_RE.test(eventId) || !UUID_RE.test(speakerId)) return NextResponse.json({ error: 'event_id and speaker_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  const sessionId = await sessionFor(eventId, speakerId)
  if (!sessionId) return NextResponse.json({ error: 'This speaker is not on any agenda session yet, so a clip cannot be queued for them.' }, { status: 409 })
  try {
    await generateLowerThirdStill(eventId, sessionId, speakerId, a.session.sid)
    await enqueueLowerThirdJob(eventId, sessionId, speakerId, a.session.sid)
    return NextResponse.json({ queued: true })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 }) }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? '', speakerId = req.nextUrl.searchParams.get('speaker_id') ?? ''
  if (!UUID_RE.test(eventId) || !UUID_RE.test(speakerId)) return NextResponse.json({ error: 'event_id and speaker_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  const sessionId = await sessionFor(eventId, speakerId)
  if (!sessionId) return NextResponse.json({ status: 'none' })
  const { data } = await supabaseAdmin.from('session_lower_thirds').select('status, preview_path').eq('agenda_session_id', sessionId).eq('speaker_id', speakerId).maybeSingle()
  if (!data) return NextResponse.json({ status: 'none' })
  const url = data.status === 'generated' && data.preview_path ? await presignGet(data.preview_path as string, 3600).catch(() => null) : null
  return NextResponse.json({ status: data.status, url })
}
