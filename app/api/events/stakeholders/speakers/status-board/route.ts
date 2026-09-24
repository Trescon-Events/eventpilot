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
    .select('id, name, public_name, role, company, producer_staff_id, bio, bio_full_url, photo_url, website_card_url, konfhub_speaker_id, status, active, announcement_status, confirmation_status, is_uae_resident, reference, email, custom_fields')
    .eq('event_id', eventId)
    .neq('announcement_status', 'archived')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const speakerIds = (speakers ?? []).map(s => s.id)

  // Passport/National ID (2026-09-24) — 'missing' | 'in_progress' |
  // 'reviewed'. A document merely being uploaded isn't enough to count as
  // done: a producer has to explicitly mark it reviewed (see the review
  // migration + SensitiveDocumentsTab's own "Mark as Reviewed" button) —
  // only then is it considered available for further processing.
  type DocStatus = 'missing' | 'in_progress' | 'reviewed'

  const [announcementStatus, producers, sensitiveDocs, speakersWithContacts] = await Promise.all([
    fetchAnnouncementStatus(speakerIds),
    (async () => {
      const producerIds = [...new Set((speakers ?? []).map(s => s.producer_staff_id).filter((id): id is string => !!id))]
      if (producerIds.length === 0) return new Map<string, string>()
      const { data } = await supabaseAdmin.from('staff_members').select('id, name').in('id', producerIds)
      return new Map((data ?? []).map(p => [p.id, p.name]))
    })(),
    (async () => {
      if (speakerIds.length === 0) return new Map<string, DocStatus>()
      const { data } = await supabaseAdmin
        .from('speaker_sensitive_documents')
        .select('speaker_id, document_type, reviewed_at')
        .in('speaker_id', speakerIds)
        .is('deleted_at', null)
      return new Map((data ?? []).map(d => [`${d.speaker_id}:${d.document_type}`, (d.reviewed_at ? 'reviewed' : 'in_progress') as DocStatus]))
    })(),
    // Assistant Email (2026-09-24) — green once AT LEAST ONE Additional
    // Contact (assistant/office contact, auto-captured from the onboarding
    // form's consent checkbox or added manually — see speaker_additional_
    // contacts_migration.sql) exists for this speaker, regardless of which
    // one; this column doesn't distinguish "the assistant specifically" vs
    // any other additional contact, matching how the Communications tab's
    // own Cc auto-fill already treats the whole list the same way.
    (async () => {
      if (speakerIds.length === 0) return new Set<string>()
      const { data } = await supabaseAdmin.from('speaker_additional_contacts').select('speaker_id').in('speaker_id', speakerIds)
      return new Set((data ?? []).map(d => d.speaker_id))
    })(),
  ])
  const docStatus = (speakerId: string, type: 'passport' | 'national_id'): DocStatus => sensitiveDocs.get(`${speakerId}:${type}`) ?? 'missing'

  // Email (2026-09-24) — same custom_fields.email-with-legacy-fallback
  // resolution every other speaker-communication route in this app already
  // uses (compose/remind/acknowledge routes) — reused inline here rather
  // than a new shared export, matching how each of those routes already
  // does its own inline copy of this exact logic.
  function speakerHasEmail(customFields: unknown, legacyEmail: string | null): boolean {
    const v = (customFields as Record<string, unknown> | null)?.email
    const fromCustom = Array.isArray(v) ? v[0] : v
    return !!((typeof fromCustom === 'string' ? fromCustom : '').trim() || (legacyEmail ?? '').trim())
  }

  const rows = (speakers ?? []).map(s => ({
    id: s.id,
    name: s.public_name || s.name,
    job_title: s.role,
    company_name: s.company,
    producer_staff_id: s.producer_staff_id,
    producer_name: s.producer_staff_id ? (producers.get(s.producer_staff_id) ?? null) : null,
    // Collection stage
    email: speakerHasEmail(s.custom_fields, s.email),
    assistant_email: speakersWithContacts.has(s.id),
    full_bio: !!s.bio_full_url,
    photo: !!s.photo_url,
    passport_status: docStatus(s.id, 'passport'),
    national_id_status: docStatus(s.id, 'national_id'),
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
    // Short Bio (2026-09-24) — 'missing' | 'in_progress' | 'approved'.
    // in_progress = text present but the speaker hasn't been Approved for
    // Announcement yet (a whole-record blanket approval, not per-field —
    // see the Details page's own "Approve for Announcement" card copy —
    // reused here anyway per Madhu as the intended "final" signal for this
    // one column specifically).
    short_bio_status: !s.bio?.trim() ? 'missing' as const : s.announcement_status === 'ready' ? 'approved' as const : 'in_progress' as const,
    // Website Photo (2026-09-24, merged with the old separate "Cleaned
    // Photo" column per Madhu: they're generated together in one cycle, so
    // a generated website_card_url already implies cleaned) — reuses the
    // `photo` field above (raw photo received) as the "in progress" gate.
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
