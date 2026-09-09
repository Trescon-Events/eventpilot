import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { websiteStatus, fetchAnnouncementStatus } from '@/app/lib/events/speaker-status'

/* GET /api/events/stakeholders/speakers/status-board?event_id=X

   One row per speaker with every onboarding-status signal the Status
   Board needs — collection-stage (Full Bio, Photo, Passport, National ID),
   production-stage (Short Bio, Cleaned Photo, Website Photo), and the
   existing 3-state announcement columns (Website/Social Post/Self Promo,
   shared with the Registry view via app/lib/events/speaker-status.ts).
   Archived speakers excluded, same default as the Registry list.

   national_id_applicable (2026-09-08) — the wizard's own boolean `national_
   id` never changes meaning, but the Board needs to know whether it's even
   REQUIRED for this speaker before showing it as missing: National ID is
   only required for UAE residents (mirrors the HubSpot onboarding form's
   own logic). false only once a producer has explicitly marked someone
   NOT a UAE resident — is_uae_resident null (not yet determined) still
   counts as applicable, so nobody's National ID silently stops being
   asked for just because it hasn't been checked yet. confirmation_status
   rides along unchanged (free text — 'On Hold' is a producer-typed value,
   not a new enum enforced here; see the DB CHECK constraint instead). */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: speakers, error } = await supabaseAdmin
    .from('event_speakers')
    .select('id, name, public_name, role, company, producer_staff_id, bio, bio_full_url, photo_url, photo_cleaning_cycle_done, website_card_url, konfhub_speaker_id, status, active, announcement_status, confirmation_status, is_uae_resident, reference')
    .eq('event_id', eventId)
    .neq('announcement_status', 'archived')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const speakerIds = (speakers ?? []).map(s => s.id)

  const [announcementStatus, producers, sensitiveDocs] = await Promise.all([
    fetchAnnouncementStatus(speakerIds),
    (async () => {
      const producerIds = [...new Set((speakers ?? []).map(s => s.producer_staff_id).filter((id): id is string => !!id))]
      if (producerIds.length === 0) return new Map<string, string>()
      const { data } = await supabaseAdmin.from('staff_members').select('id, name').in('id', producerIds)
      return new Map((data ?? []).map(p => [p.id, p.name]))
    })(),
    (async () => {
      if (speakerIds.length === 0) return new Set<string>()
      const { data } = await supabaseAdmin
        .from('speaker_sensitive_documents')
        .select('speaker_id, document_type')
        .in('speaker_id', speakerIds)
        .is('deleted_at', null)
      return new Set((data ?? []).map(d => `${d.speaker_id}:${d.document_type}`))
    })(),
  ])

  const rows = (speakers ?? []).map(s => ({
    id: s.id,
    name: s.public_name || s.name,
    job_title: s.role,
    company_name: s.company,
    producer_staff_id: s.producer_staff_id,
    producer_name: s.producer_staff_id ? (producers.get(s.producer_staff_id) ?? null) : null,
    // Collection stage
    full_bio: !!s.bio_full_url,
    photo: !!s.photo_url,
    passport: sensitiveDocs.has(`${s.id}:passport`),
    national_id: sensitiveDocs.has(`${s.id}:national_id`),
    // UAE Resident (2026-09-08) — mirrors the HubSpot onboarding form's own
    // logic: National ID is only required alongside Passport for UAE
    // residents. null = not yet determined (producers backfill this by
    // hand for anyone confirmed before the form asked). Not applicable
    // ONLY once a producer has explicitly marked someone NOT a UAE
    // resident — unknown still counts as potentially needing it, so it
    // isn't silently excused just because nobody's checked yet.
    is_uae_resident: s.is_uae_resident,
    national_id_applicable: s.is_uae_resident !== false,
    // Production stage
    short_bio: !!(s.bio && s.bio.trim()),
    cleaned_photo: !!s.photo_cleaning_cycle_done,
    website_photo: !!s.website_card_url,
    // Existing 3-state columns (shared with the Registry view)
    website_status: websiteStatus(s),
    social_post_status: announcementStatus.get(s.id)?.socialPostStatus ?? 'pending',
    self_promo_status: announcementStatus.get(s.id)?.selfPromoStatus ?? 'pending',
    confirmation_status: s.confirmation_status,
    reference: s.reference,
  }))

  const producerOptions = [...producers.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ rows, producers: producerOptions })
}
