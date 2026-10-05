import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { getKonfhubToken, createKonfhubSpeaker, updateKonfhubSpeaker, fetchKonfhubTags, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-push-role
   Body: { tag_id } — one of the event's KonfHub roles.

   Publishes (or updates) an ADDITIONAL, independent KonfHub speaker record
   for this same EventPilot speaker, tagged with just that one role — the
   Additional Roles tab's push action (generalised 2026-10-04 from the old
   single "Second Role" slot, which could only be the Speaker/Moderator
   complement).

   Why a record per role: KonfHub's Agenda has no per-session role —
   whichever tag a speaker record carries shows next to the name in EVERY
   session it's assigned to. A person who speaks in one session, moderates
   another and chairs a roundtable needs one record per role to assign in
   each session's picker. The SAME role in several sessions needs no extra
   record (KonfHub allows one speaker in many sessions — verified live
   2026-10-04). KonfHub can't hide a speaker from its public listing, so
   these stay visible; they're pushed to the bottom of the order (9999).

   One row per (speaker, role) in speaker_konfhub_roles holds that record's
   own konfhub_speaker_id, separate from the main konfhub_speaker_id. First
   push creates, later pushes update the same record — never
   delete-and-recreate (Agenda sessions reference a speaker by this id).
   Same readiness gates and field mapping as konfhub-push/route.ts; the
   record is cosmetically identical to the main one except its single tag. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as { tag_id?: string } | null
  if (!body?.tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 })

  const { data: speaker, error: speakerError } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, public_name, pronoun_style, photo_cleaning_cycle_done, website_card_url, company_logo_url, bio, role, company, linkedin_url, konfhub_primary_role_tag_id')
    .eq('id', speakerId)
    .single()
  if (speakerError) {
    console.error(`[konfhub-push-role] speaker ${speakerId} lookup failed:`, speakerError.message)
    return NextResponse.json({ error: `Could not look up this speaker — ${speakerError.message}` }, { status: 500 })
  }
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (!speaker.public_name?.trim() || !speaker.pronoun_style) {
    return NextResponse.json({ error: 'Set Public Name and Pronoun / Honorific Style first.' }, { status: 422 })
  }
  if (!speaker.photo_cleaning_cycle_done) return NextResponse.json({ error: 'Clean the photo first.' }, { status: 422 })
  if (!speaker.website_card_url) return NextResponse.json({ error: 'Generate the Website Photo first.' }, { status: 422 })

  const roles = await getEventRoles(speaker.event_id)
  const role = roles.find(r => r.tag_id === body.tag_id)
  if (!role) return NextResponse.json({ error: 'That role isn’t configured for this event — fetch and map tags on the Integrations page first.' }, { status: 422 })
  if (resolvePrimaryRole(speaker.konfhub_primary_role_tag_id, roles)?.tag_id === role.tag_id) {
    return NextResponse.json({ error: `${role.label} is already this speaker’s main listing role — an extra record is only for a different role.` }, { status: 422 })
  }

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id, konfhub_speaker_category_id')
    .eq('event_id', speaker.event_id)
    .single()
  if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
    return NextResponse.json({ error: 'KonfHub isn’t configured for this event yet — set it up in Website Settings first.' }, { status: 422 })
  }

  const { data: existing } = await supabaseAdmin
    .from('speaker_konfhub_roles').select('konfhub_speaker_id').eq('speaker_id', speakerId).eq('tag_id', role.tag_id).maybeSingle()

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    // KonfHub shows the tag name we send literally — use ITS name, not our editable label.
    const khTagName = (await fetchKonfhubTags(website.konfhub_event_id, token)).find(t => t.id === role.tag_id)?.name ?? role.label
    const fields = {
      name: speaker.public_name!.trim(),
      about: speaker.bio || undefined,
      image_url: speaker.website_card_url || undefined,
      organisation_logo_url: speaker.company_logo_url || undefined,
      designation: speaker.role || undefined,
      organisation: speaker.company || undefined,
      linkedin_url: speaker.linkedin_url || undefined,
      speaker_category_id: website.konfhub_speaker_category_id || undefined,
      tags: [{ id: role.tag_id, name: khTagName }],
    }

    const wasFirstPush = !existing?.konfhub_speaker_id
    let konfhubSpeakerId: string
    if (wasFirstPush) {
      konfhubSpeakerId = await createKonfhubSpeaker(website.konfhub_event_id, token, { ...fields, speaker_order: 9999 })
    } else {
      konfhubSpeakerId = existing!.konfhub_speaker_id!
      await updateKonfhubSpeaker(website.konfhub_event_id, konfhubSpeakerId, token, fields)
    }

    const syncedAt = new Date().toISOString()
    await supabaseAdmin
      .from('speaker_konfhub_roles')
      .upsert({ speaker_id: speakerId, tag_id: role.tag_id, konfhub_speaker_id: konfhubSpeakerId, synced_at: syncedAt }, { onConflict: 'speaker_id,tag_id' })

    return NextResponse.json({ tag_id: role.tag_id, konfhub_speaker_id: konfhubSpeakerId, synced_at: syncedAt, was_first_push: wasFirstPush })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not push to KonfHub'
    console.error(`[konfhub-push-role] speaker ${speakerId} role ${role.label} failed:`, e instanceof KonfhubApiError ? `status ${e.status} — ${message}` : message)
    const status = e instanceof KonfhubApiError && e.status >= 400 && e.status < 500 ? 422 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
