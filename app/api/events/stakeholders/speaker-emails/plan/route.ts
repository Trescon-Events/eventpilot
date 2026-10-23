import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { planSpeakerEmails, previewSpeakerEmail } from '@/app/lib/speaker-emails/server'

/* POST { event_id, speaker_ids, body_html?, preview_speaker_id? } — who each email goes to / from, and (with a preview speaker) the exact email that speaker will receive. Sends nothing. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; speaker_ids?: string[]; body_html?: string; preview_speaker_id?: string } | null
  if (!body?.event_id || !Array.isArray(body.speaker_ids)) return NextResponse.json({ error: 'event_id and speaker_ids are required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied
  const session = getSession(req)
  const rows = await planSpeakerEmails(body.event_id, body.speaker_ids.slice(0, 500), session)
  const preview = body.preview_speaker_id ? await previewSpeakerEmail(body.event_id, body.preview_speaker_id, body.body_html ?? '', session) : null
  return NextResponse.json({ rows, preview_html: preview?.html ?? null })
}
