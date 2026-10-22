import { NextRequest, NextResponse } from 'next/server'
import { requireMediaSendAccess, mediaSetupProblem } from '@/app/lib/pr/send-access'
import { planMediaRequests } from '@/app/lib/pr/media-interest'

/* POST { event_id, speaker_ids } — per speaker: who it would go to, who it would come from, and whether it can be sent (ready / already asked / already answered / no email).
   Read-only: nothing is created or sent. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; speaker_ids?: string[] } | null
  if (!body?.event_id || !Array.isArray(body.speaker_ids) || !body.speaker_ids.length || body.speaker_ids.length > 200) return NextResponse.json({ error: 'event_id and speaker_ids (up to 200) are required' }, { status: 400 })
  const auth = await requireMediaSendAccess(req, body.event_id); if ('error' in auth) return auth.error
  const problem = await mediaSetupProblem(body.event_id); if (problem) return NextResponse.json({ error: problem }, { status: 409 })
  return NextResponse.json({ rows: await planMediaRequests(body.event_id, body.speaker_ids, auth.session) })
}
