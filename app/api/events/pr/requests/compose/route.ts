import { NextRequest, NextResponse } from 'next/server'
import { requireMediaSendAccess, mediaSetupProblem } from '@/app/lib/pr/send-access'
import { composeMediaRequest } from '@/app/lib/pr/media-interest'

/* POST { event_id, speaker_id, note? } — renders ONE sample of the request email (nothing is created or sent). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; speaker_id?: string; note?: string } | null
  if (!body?.event_id || !body.speaker_id) return NextResponse.json({ error: 'event_id and speaker_id are required' }, { status: 400 })
  const auth = await requireMediaSendAccess(req, body.event_id); if ('error' in auth) return auth.error
  const problem = await mediaSetupProblem(body.event_id); if (problem) return NextResponse.json({ error: problem }, { status: 409 })
  const c = await composeMediaRequest(body.speaker_id, body.event_id, auth.session, { note: body.note, previewOnly: true })
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status })
  return NextResponse.json({ subject: c.subject, html: c.html, to: c.to, cc: c.cc, sender_name: c.sender_name, sender_email: c.sender_email })
}
