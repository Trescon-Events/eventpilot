import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, deleteKonfhubSpeaker, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-remove-role
   Body: { tag_id }

   Deletes the additional-role KonfHub record created by konfhub-push-role
   for that role, and its speaker_konfhub_roles row — for when this speaker
   no longer needs that role anywhere, so producers aren't left maintaining
   a stray duplicate. Never touches the main record or any other role's
   record. Deleting the row (rather than nulling the id) means a future push
   creates a fresh record instead of erroring against a deleted one. A safe
   no-op if no such record exists. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as { tag_id?: string } | null
  if (!body?.tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 })

  const { data: speaker, error: speakerError } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).single()
  if (speakerError) {
    console.error(`[konfhub-remove-role] speaker ${speakerId} lookup failed:`, speakerError.message)
    return NextResponse.json({ error: `Could not look up this speaker — ${speakerError.message}` }, { status: 500 })
  }
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: row } = await supabaseAdmin
    .from('speaker_konfhub_roles').select('konfhub_speaker_id').eq('speaker_id', speakerId).eq('tag_id', body.tag_id).maybeSingle()
  if (!row) return NextResponse.json({ ok: true })

  if (row.konfhub_speaker_id) {
    const { data: website } = await supabaseAdmin
      .from('event_websites').select('konfhub_client_id, konfhub_client_secret, konfhub_event_id').eq('event_id', speaker.event_id).single()
    if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
      return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 422 })
    }
    try {
      const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
      await deleteKonfhubSpeaker(website.konfhub_event_id, row.konfhub_speaker_id, token)
    } catch (e) {
      const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not remove from KonfHub'
      console.error(`[konfhub-remove-role] speaker ${speakerId} failed:`, e instanceof KonfhubApiError ? `status ${e.status} — ${message}` : message)
      const status = e instanceof KonfhubApiError && e.status >= 400 && e.status < 500 ? 422 : 502
      return NextResponse.json({ error: message }, { status })
    }
  }
  await supabaseAdmin.from('speaker_konfhub_roles').delete().eq('speaker_id', speakerId).eq('tag_id', body.tag_id)
  return NextResponse.json({ ok: true })
}
