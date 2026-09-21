import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, deleteKonfhubSpeaker, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-remove-listing

   "Just unpublish from KonfHub, keep them active in EventPilot" (2026-09-21,
   Madhu — for when a producer pushes a speaker live and then realizes it
   isn't time yet). Distinct from both existing KonfHub-removal paths:
   - DELETE .../speakers/[id]'s also_remove_from_konfhub_listing flag does
     the same underlying deleteKonfhubSpeaker call, but only as part of
     also archiving the whole EventPilot record — not what's wanted here.
   - konfhub-remove-secondary/route.ts is the same idea for the SECOND-role
     record, untouched by this route (this one only ever reads/writes the
     PRIMARY konfhub_speaker_id/konfhub_synced_at columns).

   This route touches ONLY those two columns (plus konfhub_speaker_removed_at
   for the record) — never announcement_status, never `active`. The speaker
   stays exactly as visible/approved/whatever it already was in EventPilot;
   only the public KonfHub listing goes away. Clearing konfhub_speaker_id to
   NULL means a future "Push to KonfHub" creates a fresh record instead of
   erroring against one that no longer exists — same reasoning as every
   other KonfHub-removal path in this codebase.

   Real, immediate delete on KonfHub's side — same caveat as the Delete
   Speaker flow's own checkbox: if this speaker is actually assigned to a
   KonfHub Agenda session, removing the listing drops them from it too.
   The UI (RemoveFromKonfhubListingModal.tsx) runs the same live session
   check .../speakers/dependencies already provides before confirming —
   this route doesn't re-check it server-side, trusting the same
   warn-don't-block posture the Delete flow already established. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker, error: speakerError } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, konfhub_speaker_id')
    .eq('id', speakerId)
    .single()
  if (speakerError) {
    console.error(`[konfhub-remove-listing] speaker ${speakerId} lookup failed:`, speakerError.message)
    return NextResponse.json({ error: `Could not look up this speaker — ${speakerError.message}` }, { status: 500 })
  }
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!speaker.konfhub_speaker_id) return NextResponse.json({ ok: true })

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
    await deleteKonfhubSpeaker(website.konfhub_event_id, speaker.konfhub_speaker_id, token)
    await supabaseAdmin
      .from('event_speakers')
      .update({ konfhub_speaker_id: null, konfhub_synced_at: null, konfhub_speaker_removed_at: new Date().toISOString() })
      .eq('id', speakerId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not remove from KonfHub'
    console.error(`[konfhub-remove-listing] speaker ${speakerId} failed:`, e instanceof KonfhubApiError ? `status ${e.status} — ${message}` : message)
    const status = e instanceof KonfhubApiError && e.status >= 400 && e.status < 500 ? 422 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
