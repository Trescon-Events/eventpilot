import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, createKonfhubSpeaker, updateKonfhubSpeaker, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-push
   Publishes (or updates) this speaker on KonfHub's Speakers-management API
   — the "Push to KonfHub" action, deliberately separate from "Approve for
   Announcement" (2026-08-24, per Madhu: approving a speaker for internal
   creative generation and publishing them publicly on KonfHub + the event
   website are different decisions with different stakes, so they're two
   buttons with two confirmations, not one).

   Reuses Approve's own readiness gate (photo cleaned, Website Photo
   generated, Public Name + Pronoun set — see the Details page's
   readyForApproval/approveBlockedReason) but enforces it SERVER-SIDE here,
   unlike Approve's own PATCH route, which only checks this client-side
   (confirmed while researching this feature — a real gap, not repeated
   here since this route creates a real public-facing record on a third
   party's system).

   First push (konfhub_speaker_id not yet set) CREATES a new KonfHub
   speaker; every push after that UPDATES the existing one by that id —
   never delete+recreate, since KonfHub's own Agenda sessions reference a
   speaker by this id (see konfhub-speakers.ts's own top comment).

   Field mapping is deliberately narrow — only send keys EventPilot
   actually owns a value for (name, about, image, logo, designation,
   organisation, linkedin). KonfHub's speaker object also supports
   location/facebook_url/twitter_url/website_url, none of which have an
   EventPilot source yet; never send those keys at all, so a producer who
   set one of those directly in KonfHub never has it silently clobbered by
   a sync from a system that doesn't track it.

   Speaker/Moderator tags (2026-08-25) — the panel-discussion workaround
   (a person speaks in one session, moderates another) turned out not to
   need a duplicate KonfHub record at all: a single speaker's `tags` array
   can hold both a Speaker and a Moderator tag at once, confirmed live to
   render correctly on both KonfHub's own page and the event website.
   event_speakers.konfhub_tag_speaker/konfhub_tag_moderator (producer-
   controlled checkboxes on this Details page, default speaker=true,
   moderator=false for every new speaker) decide which of this event's
   real tag ids (event_websites.konfhub_speaker_tag_id/
   konfhub_moderator_tag_id — per-event, found via GET /event/:id/tags,
   undocumented — see git history) get sent. This is purely a KonfHub
   display classification — it never touches announcement_status,
   website_status, or any other "is this a published speaker" signal in
   EventPilot itself. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, public_name, pronoun_style, photo_cleaning_cycle_done, website_card_url, company_logo_url, bio, role, company, linkedin_url, order_index, konfhub_speaker_id, konfhub_tag_speaker, konfhub_tag_moderator')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Same three gates the Details page's own "Push to KonfHub" button
  // checks before it's even clickable — re-checked here since a client is
  // never trustworthy for a gate that creates a real public record.
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
    .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id, konfhub_speaker_tag_id, konfhub_moderator_tag_id')
    .eq('event_id', speaker.event_id)
    .single()
  if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
    return NextResponse.json({ error: 'KonfHub isn’t configured for this event yet — set it up in Website Settings first.' }, { status: 422 })
  }

  // Omitted entirely (not sent as []) when this event has no configured
  // tag ids yet — a safe no-op, same shape as konfhub_registration_field_map
  // elsewhere in this codebase, rather than clobbering tags a producer set
  // directly in KonfHub for an event this feature hasn't been set up for.
  const tags: { id: string; name: string }[] = []
  if (speaker.konfhub_tag_speaker && website.konfhub_speaker_tag_id) tags.push({ id: website.konfhub_speaker_tag_id, name: 'Speaker' })
  if (speaker.konfhub_tag_moderator && website.konfhub_moderator_tag_id) tags.push({ id: website.konfhub_moderator_tag_id, name: 'Moderator' })

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
      ...(tags.length > 0 ? { tags } : {}),
    }

    const wasFirstPush = !speaker.konfhub_speaker_id
    let konfhubSpeakerId: string
    if (wasFirstPush) {
      konfhubSpeakerId = await createKonfhubSpeaker(website.konfhub_event_id, token, { ...fields, speaker_order: speaker.order_index ?? 0 })
    } else {
      konfhubSpeakerId = speaker.konfhub_speaker_id!
      await updateKonfhubSpeaker(website.konfhub_event_id, konfhubSpeakerId, token, fields)
    }

    const syncedAt = new Date().toISOString()
    await supabaseAdmin
      .from('event_speakers')
      .update({ konfhub_speaker_id: konfhubSpeakerId, konfhub_synced_at: syncedAt })
      .eq('id', speakerId)

    return NextResponse.json({ konfhub_speaker_id: konfhubSpeakerId, konfhub_synced_at: syncedAt, was_first_push: wasFirstPush })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not push to KonfHub'
    console.error(`[konfhub-push] speaker ${speakerId} failed:`, e instanceof KonfhubApiError ? `status ${e.status} — ${message}` : message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
