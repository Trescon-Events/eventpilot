import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, createKonfhubSpeaker, updateKonfhubSpeaker, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-push-secondary
   Publishes (or updates) a SECOND, independent KonfHub speaker record for
   this same EventPilot speaker — the "Second Role" tab's push action
   (2026-08-31).

   Why a second record at all, when konfhub-push/route.ts's own `tags`
   array can already mark one KonfHub speaker as Speaker or Moderator:
   that decides how this person shows on the master Speakers listing, but
   KonfHub's Agenda tool has no per-session role — whichever tag a
   KonfHub speaker record carries is what shows next to their name in
   EVERY session they're assigned to. Someone who speaks in one session
   and moderates a different one needs a distinct record tagged with the
   OTHER role, to assign to that other session's Agenda picker without
   also reading as their primary role there. Mirrors the manual workaround
   producers already used (duplicate in KonfHub, tag the copy with
   whichever role wasn't covered) — KonfHub has no "hide from public
   listing" capability (confirmed with Madhu 2026-08-31), so this second
   record stays visible on the master listing and event website too, same
   as the manual duplicate always was. Pushed to the bottom of KonfHub's
   speaker order by default to keep it out of the way, same as producers
   already did by hand.

   Deliberately role-agnostic, not hardcoded to Moderator (an earlier
   version of this route was — Madhu caught the asymmetry 2026-08-31: a
   speaker's primary tag could just as easily be Moderator first, with
   Speaker confirmed later for a different session). event_speakers.
   konfhub_tag_speaker/konfhub_tag_moderator are now mutually exclusive on
   the primary record (enforced client-side on the Details page's Overview
   radio pair) — this route always tags the SECOND record with whichever
   of the two the primary record does NOT carry, computed fresh on every
   push rather than stored, so it stays correct if the primary's own tag
   is changed later.

   konfhub_secondary_speaker_id is this second record's own id, entirely
   separate from the primary konfhub_speaker_id — never touches or reads
   the primary record beyond checking its tag to compute the complement.
   First push (no konfhub_secondary_speaker_id yet) CREATES; every push
   after that UPDATES the same record — same never-delete-and-recreate
   reasoning as the primary push (see konfhub-speakers.ts's own top
   comment: KonfHub's Agenda sessions reference a speaker by this id).

   Same field mapping and readiness gates as konfhub-push/route.ts (Public
   Name + Pronoun set, photo cleaned, Website Photo generated) — this
   second record is cosmetically identical to the primary (same name,
   photo, bio) except its single tag. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, public_name, pronoun_style, photo_cleaning_cycle_done, website_card_url, company_logo_url, bio, role, company, linkedin_url, konfhub_secondary_speaker_id, konfhub_tag_speaker, konfhub_tag_moderator')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Same three gates the primary Push-to-KonfHub route enforces — this
  // second record is cosmetically identical to the primary, so it can't
  // be pushed before the primary readiness conditions are met either.
  if (!speaker.public_name?.trim() || !speaker.pronoun_style) {
    return NextResponse.json({ error: 'Set Public Name and Pronoun / Honorific Style first.' }, { status: 422 })
  }
  if (!speaker.photo_cleaning_cycle_done) {
    return NextResponse.json({ error: 'Clean the photo first.' }, { status: 422 })
  }
  if (!speaker.website_card_url) {
    return NextResponse.json({ error: 'Generate the Website Photo first.' }, { status: 422 })
  }

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id, konfhub_speaker_tag_id, konfhub_moderator_tag_id, konfhub_speaker_category_id')
    .eq('event_id', speaker.event_id)
    .single()
  if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
    return NextResponse.json({ error: 'KonfHub isn’t configured for this event yet — set it up in Website Settings first.' }, { status: 422 })
  }

  // The complement of the primary record's own tag — Speaker if the
  // primary is Moderator (or has no tag set at all), Moderator otherwise.
  // Mutually exclusive on the primary as of 2026-08-31, so this is always
  // well-defined; falls back to Moderator only in the defensive case of a
  // pre-existing record with neither box checked.
  const secondaryRole: 'speaker' | 'moderator' = speaker.konfhub_tag_speaker ? 'moderator' : 'speaker'
  const tagId = secondaryRole === 'speaker' ? website.konfhub_speaker_tag_id : website.konfhub_moderator_tag_id
  if (!tagId) {
    return NextResponse.json({ error: `This event has no ${secondaryRole === 'speaker' ? 'Speaker' : 'Moderator'} tag configured on KonfHub yet — set it in Website Settings first.` }, { status: 422 })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    const fields = {
      name: speaker.public_name!.trim(),
      about: speaker.bio || undefined,
      image_url: speaker.website_card_url || undefined,
      organisation_logo_url: speaker.company_logo_url || undefined,
      designation: speaker.role || undefined,
      organisation: speaker.company || undefined,
      linkedin_url: speaker.linkedin_url || undefined,
      speaker_category_id: website.konfhub_speaker_category_id || undefined,
      tags: [{ id: tagId, name: secondaryRole === 'speaker' ? 'Speaker' : 'Moderator' }],
    }

    const wasFirstPush = !speaker.konfhub_secondary_speaker_id
    let konfhubSpeakerId: string
    if (wasFirstPush) {
      // speaker_order 9999 — comfortably past any real roster size, so
      // this second record sorts to the bottom of KonfHub's speaker list
      // by default, same place producers already moved the manual
      // duplicate to (KonfHub has no way to hide it outright).
      konfhubSpeakerId = await createKonfhubSpeaker(website.konfhub_event_id, token, { ...fields, speaker_order: 9999 })
    } else {
      konfhubSpeakerId = speaker.konfhub_secondary_speaker_id!
      await updateKonfhubSpeaker(website.konfhub_event_id, konfhubSpeakerId, token, fields)
    }

    const syncedAt = new Date().toISOString()
    await supabaseAdmin
      .from('event_speakers')
      .update({ konfhub_secondary_speaker_id: konfhubSpeakerId, konfhub_secondary_synced_at: syncedAt })
      .eq('id', speakerId)

    return NextResponse.json({ konfhub_secondary_speaker_id: konfhubSpeakerId, konfhub_secondary_synced_at: syncedAt, was_first_push: wasFirstPush, role: secondaryRole })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not push to KonfHub'
    console.error(`[konfhub-push-secondary] speaker ${speakerId} failed:`, e instanceof KonfhubApiError ? `status ${e.status} — ${message}` : message)
    // Same 4xx-vs-other classification as the primary push route — KonfHub
    // rejecting the data itself is producer-actionable, surfaced as 422
    // with KonfHub's own message rather than a generic 502.
    const status = e instanceof KonfhubApiError && e.status >= 400 && e.status < 500 ? 422 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
