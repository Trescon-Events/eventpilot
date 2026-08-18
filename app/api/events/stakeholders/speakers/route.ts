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
    has_announcement: announcementStatus.get(row.id)?.hasAnnouncement ?? false,
    self_promo_sent: announcementStatus.get(row.id)?.selfPromoSent ?? false,
  })))
}

/* Roster status columns (2026-08-18 SAE-into-Hub merge) — "Announced" and
   "Self Promo Sent" aren't booleans on event_speakers itself: Announced =
   at least one org_promo row in stakeholder_announcements; Self Promo Sent
   = a stakeholder_announcement_sends row with status='sent' for one of
   this speaker's self_promo announcements. Two batched queries for the
   whole roster rather than N+1 per speaker. */
async function fetchAnnouncementStatus(speakerIds: string[]): Promise<Map<string, { hasAnnouncement: boolean; selfPromoSent: boolean }>> {
  const result = new Map<string, { hasAnnouncement: boolean; selfPromoSent: boolean }>()
  if (speakerIds.length === 0) return result

  const { data: announcements } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, speaker_id, announcement_kind')
    .in('speaker_id', speakerIds)

  const bySpeaker = new Map<string, { hasOrgPromo: boolean; selfPromoIds: string[] }>()
  for (const a of announcements ?? []) {
    if (!a.speaker_id) continue
    const entry = bySpeaker.get(a.speaker_id) ?? { hasOrgPromo: false, selfPromoIds: [] }
    if (a.announcement_kind === 'self_promo') entry.selfPromoIds.push(a.id)
    else entry.hasOrgPromo = true
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
    result.set(speakerId, {
      hasAnnouncement: entry.hasOrgPromo,
      selfPromoSent: entry.selfPromoIds.some(id => sentAnnouncementIds.has(id)),
    })
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
  for (const f of schema) {
    // A required checkbox means "must be checked" — hasValue() alone would
    // also accept the explicit 'false' string a real unchecked box stores.
    const unsatisfied = f.type === 'checkbox' ? body.fields[f.key] !== 'true' : !hasValue(body.fields[f.key])
    if (f.required && f.type !== 'file' && unsatisfied) {
      return NextResponse.json({ error: `${f.label} is required` }, { status: 400 })
    }
  }

  const { columns, customFields } = mapFieldsToRecord('speaker', schema, body.fields, {})

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .insert({ ...columns, event_id: body.event_id, custom_fields: customFields, source: body.source ?? 'manual', created_by: body.created_by || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...fromRow(data), fields: recordToFields('speaker', schema, data) }, { status: 201 })
}

function hasValue(v: SubmittedValue | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0
  return !!v && v.trim().length > 0
}
