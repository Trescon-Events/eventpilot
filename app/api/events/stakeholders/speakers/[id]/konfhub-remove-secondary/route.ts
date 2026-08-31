import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, deleteKonfhubSpeaker, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-remove-secondary
   Deletes the second-role KonfHub speaker record created by
   konfhub-push-secondary/route.ts and clears konfhub_secondary_speaker_id
   — for when this speaker no longer needs a second role anywhere, so
   producers aren't left maintaining a stray duplicate on KonfHub
   indefinitely. Only ever touches the secondary's own id/sync columns —
   never the primary konfhub_speaker_id record, which this route doesn't
   even read.

   Clearing konfhub_secondary_speaker_id to NULL (rather than leaving it
   set to a now-deleted id) means a future push creates a fresh record
   instead of erroring against one that no longer exists — same reasoning
   as the primary record's own delete-tracking migration. A safe no-op if
   this speaker never had a second-role record pushed in the first place. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, konfhub_secondary_speaker_id')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!speaker.konfhub_secondary_speaker_id) return NextResponse.json({ ok: true })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id')
    .eq('event_id', speaker.event_id)
    .single()
  if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
    return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 422 })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    await deleteKonfhubSpeaker(website.konfhub_event_id, speaker.konfhub_secondary_speaker_id, token)
    await supabaseAdmin
      .from('event_speakers')
      .update({ konfhub_secondary_speaker_id: null, konfhub_secondary_synced_at: null })
      .eq('id', speakerId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not remove from KonfHub'
    console.error(`[konfhub-remove-secondary] speaker ${speakerId} failed:`, e instanceof KonfhubApiError ? `status ${e.status} — ${message}` : message)
    const status = e instanceof KonfhubApiError && e.status >= 400 && e.status < 500 ? 422 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
