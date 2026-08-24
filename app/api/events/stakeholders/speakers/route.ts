import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord, recordToFields } from '@/app/lib/forms/map-to-stakeholder-record'
import { SubmittedValue } from '@/app/lib/forms/types'

/* GET  /api/events/stakeholders/speakers?event_id=X&status=Y
   POST /api/events/stakeholders/speakers

   Reads/writes the existing event_speakers table (shared with Website
   Builder + KonfHub — see app/api/events/speakers/route.ts, untouched by
   this file). Deliberately never writes `status`, `tier`, or `active` —
   those drive the public website + KonfHub sync. This route only ever
   touches `announcement_status` and the SAE-specific columns added by
   supabase/sae_migration.sql.

   Request body is schema-driven (Phase 4 of the SAE producer-workflow
   initiative) — `fields` is keyed by whatever FieldSchema.key the event's
   resolved speaker form declares (resolveFormSchema()), same shape the
   public onboarding form and the Form Builder use. Response still exposes
   the PRD's stable full_name/job_title/company_name aliases (fromRow) for
   backward compatibility with existing callers, plus a `fields` map
   (recordToFields) so the Hub's manual panel can seed dynamic/custom
   fields when editing. */

type SpeakerBody = {
  event_id: string
  fields: Record<string, SubmittedValue>
  source?: 'onboarding_form' | 'manual'
  created_by?: string
}

function fromRow(row: Record<string, unknown>) {
  return {
    ...row,
    full_name: row.name,
    job_title: row.role,
    company_name: row.company,
  }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const status  = req.nextUrl.searchParams.get('status')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_speakers')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (status) q = q.eq('announcement_status', status)
  else q = q.neq('announcement_status', 'archived') // archived hidden from the default (all-statuses) view

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const announcementStatus = await fetchAnnouncementStatus((data ?? []).map(s => s.id))
  return NextResponse.json((data ?? []).map(row => ({
    ...fromRow(row),
    website_status: websiteStatus(row),
    social_post_status: announcementStatus.get(row.id)?.socialPostStatus ?? 'pending',
    self_promo_status: announcementStatus.get(row.id)?.selfPromoStatus ?? 'pending',
  })))
}

export type TriState = 'pending' | 'created' | 'published'
export type SelfPromoState = 'pending' | 'created' | 'sent'

// Website column — 'published' once actually pushed to KonfHub (which also
// publishes to the event website, see .../konfhub-push/route.ts), 'created'
// once internally ready to push (status='approved' + active=true — a looser
// proxy than the push route's own real eligibility check, kept as-is since
// this column predates that route), otherwise 'pending'.
//
// Re-pointed 2026-08-24 (per Madhu, real bug he caught: Sudeep showed
// "Created" on the roster right after being pushed via the new "Push to
// KonfHub" button) — was proxied off the legacy konfhub_booking_id column
// from the OLD ticket/attendee-registration sync (removed 2026-08-23),
// which nothing has written to since. konfhub_speaker_id is the real
// signal now: every speaker already pushed (this session's individual
// pushes, or last session's one-time backfill of all 34 real WAIS Malaysia
// speakers) already has it set, so this fix alone corrects the whole
// roster's display — no data backfill needed, this was purely reading the
// wrong column.
function websiteStatus(row: { konfhub_speaker_id: string | null; status: string; active: boolean }): TriState {
  if (row.konfhub_speaker_id) return 'published'
  if (row.status === 'approved' && row.active === true) return 'created'
  return 'pending'
}

/* Roster status columns (2026-08-18 SAE-into-Hub merge, extended 2026-08-23
   for the 3-state Website/Social Post/Self Promo columns) — none of these
   are booleans on event_speakers itself. Social Post: 'published' once any
   org_promo announcement's status is 'published' (the sync-status cron only
   sets this once Postiz confirms a live post with a real URL — see
   app/api/cron/announcements/sync-status/route.ts), 'created' once one
   exists in any earlier state (draft/pending_review/approved/scheduled/
   failed), else 'pending'. Self Promo: 'sent' once a
   stakeholder_announcement_sends row with status='sent' exists for one of
   this speaker's self_promo announcements, 'created' once a self_promo
   announcement exists but hasn't been sent yet, else 'pending'. Two batched
   queries for the whole roster rather than N+1 per speaker. */
async function fetchAnnouncementStatus(speakerIds: string[]): Promise<Map<string, { socialPostStatus: TriState; selfPromoStatus: SelfPromoState }>> {
  const result = new Map<string, { socialPostStatus: TriState; selfPromoStatus: SelfPromoState }>()
  if (speakerIds.length === 0) return result

  const { data: announcements } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, speaker_id, announcement_kind, status')
    .in('speaker_id', speakerIds)

  const bySpeaker = new Map<string, { orgPromoStatuses: string[]; selfPromoIds: string[] }>()
  for (const a of announcements ?? []) {
    if (!a.speaker_id) continue
    const entry = bySpeaker.get(a.speaker_id) ?? { orgPromoStatuses: [], selfPromoIds: [] }
    if (a.announcement_kind === 'self_promo') entry.selfPromoIds.push(a.id)
    else entry.orgPromoStatuses.push(a.status)
    bySpeaker.set(a.speaker_id, entry)
  }

  const allSelfPromoIds = [...bySpeaker.values()].flatMap(e => e.selfPromoIds)
  let sentAnnouncementIds = new Set<string>()
  if (allSelfPromoIds.length > 0) {
    const { data: sends } = await supabaseAdmin
      .from('stakeholder_announcement_sends')
      .select('announcement_id')
      .in('announcement_id', allSelfPromoIds)
      .eq('status', 'sent')
    sentAnnouncementIds = new Set((sends ?? []).map(s => s.announcement_id))
  }

  for (const [speakerId, entry] of bySpeaker) {
    const socialPostStatus: TriState =
      entry.orgPromoStatuses.length === 0 ? 'pending'
      : entry.orgPromoStatuses.includes('published') ? 'published'
      : 'created'
    const selfPromoStatus: SelfPromoState =
      entry.selfPromoIds.length === 0 ? 'pending'
      : entry.selfPromoIds.some(id => sentAnnouncementIds.has(id)) ? 'sent'
      : 'created'
    result.set(speakerId, { socialPostStatus, selfPromoStatus })
  }
  return result
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as SpeakerBody | null
  if (!body?.event_id || !body?.fields) {
    return NextResponse.json({ error: 'event_id and fields required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const schema = await resolveFormSchema(body.event_id, 'speaker')
  // No required-field validation against the full resolved schema here
  // (2026-08-24, removed — same reasoning as PATCH .../speakers/[id] never
  // having it: this route's only caller is the Hub's own "Add Speaker"
  // quick-add panel, per Madhu deliberately trimmed to just
  // salutation/name/job title/company/country/bio — photo, contact
  // details, and the full public-form consent checkboxes are meant to be
  // filled in afterward on the speaker's own Details page, which this
  // route's response is immediately followed by a redirect to. Requiring
  // every field the full public onboarding form asks for would make that
  // quick-add flow impossible to complete. The `name` column is still
  // NOT NULL at the DB level — mapFieldsToRecord's own fallback (see that
  // file) synthesizes it from first_name/last_name when full_name itself
  // isn't submitted, so the insert below still can't produce a nameless row.
  const { columns, customFields } = mapFieldsToRecord('speaker', schema, body.fields, {})

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .insert({ ...columns, event_id: body.event_id, custom_fields: customFields, source: body.source ?? 'manual', created_by: body.created_by || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...fromRow(data), fields: recordToFields('speaker', schema, data) }, { status: 201 })
}
