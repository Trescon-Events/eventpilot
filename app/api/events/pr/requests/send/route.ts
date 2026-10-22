import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireMediaSendAccess, mediaSetupProblem } from '@/app/lib/pr/send-access'
import { composeMediaRequest, sendMediaRequest } from '@/app/lib/pr/media-interest'

/* POST { event_id, speaker_ids: string[], note?, resend?: boolean } — sends the media-interest request to each speaker as that speaker's producer, one at a time.
   Every speaker is re-validated here. Anyone already asked is skipped unless `resend`; anyone who already answered is skipped either way (PR can reopen via reminder).
   The client sends in chunks (MAX_PER_CALL); results are per speaker, never a blanket failure. */
export const maxDuration = 60
const MAX_PER_CALL = 8
type Result = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string; to?: string }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; speaker_ids?: string[]; note?: string; resend?: boolean } | null
  if (!body?.event_id || !Array.isArray(body.speaker_ids) || !body.speaker_ids.length) return NextResponse.json({ error: 'event_id and speaker_ids are required' }, { status: 400 })
  if (body.speaker_ids.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} speakers per request.` }, { status: 400 })
  const auth = await requireMediaSendAccess(req, body.event_id); if ('error' in auth) return auth.error
  const problem = await mediaSetupProblem(body.event_id); if (problem) return NextResponse.json({ error: problem }, { status: 409 })

  const { data: existing } = await supabaseAdmin.from('media_interest_requests').select('speaker_id, status').eq('event_id', body.event_id).in('speaker_id', body.speaker_ids)
  const state = new Map((existing ?? []).map(r => [r.speaker_id as string, r.status as string]))
  const results: Result[] = []
  for (const id of body.speaker_ids) {
    const st = state.get(id)
    if (st && st !== 'pending') { results.push({ id, status: 'skipped', reason: 'Already answered' }); continue }
    if (st === 'pending' && !body.resend) { results.push({ id, status: 'skipped', reason: 'Already asked' }); continue }
    const c = await composeMediaRequest(id, body.event_id, auth.session, { note: body.note })
    if ('error' in c) { results.push({ id, status: 'skipped', reason: c.error }); continue }
    const r = await sendMediaRequest(c)
    results.push('error' in r ? { id, status: 'failed', reason: r.error, to: c.to } : { id, status: 'sent', to: c.to })
    await new Promise(res => setTimeout(res, 400))
  }
  return NextResponse.json({ results })
}
