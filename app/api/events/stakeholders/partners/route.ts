import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord, recordToFields } from '@/app/lib/forms/map-to-stakeholder-record'
import { FormType, SubmittedValue } from '@/app/lib/forms/types'

/* GET  /api/events/stakeholders/partners?event_id=X&type=Y&status=Z
   POST /api/events/stakeholders/partners

   Reads/writes the existing event_sponsors table (shared with Website
   Builder + KonfHub — see app/api/events/sponsors/route.ts, untouched by
   this file). Deliberately never writes `tier` or `active` — those drive
   the public website + KonfHub sync. This route only ever touches
   `announcement_status`/`partner_type` and the other SAE-specific columns
   added by supabase/sae_migration.sql.

   Request body is schema-driven (Phase 4 of the SAE producer-workflow
   initiative) — `fields` is keyed by whatever FieldSchema.key the event's
   resolved partner form declares. `partner_type` stays a separate
   top-level field — it's producer-set internally, never part of any form
   schema (the public form never asks for it, PRD SS8.3). resolveFormSchema()
   falls back to 'sponsor' for the three partner categories with no
   dedicated form (exhibitors/ecosystem/all_partners), matching how the
   Hub's single fixed field set already treated them identically pre-Phase-4. */

type PartnerBody = {
  event_id: string
  fields: Record<string, SubmittedValue>
  // Which form schema to resolve/validate against — the caller (Hub)
  // passes category.formType, falling back to 'sponsor' for categories
  // with no dedicated form (exhibitors/ecosystem/all_partners). Distinct
  // from partner_type below, which is the actual tier/category stored on
  // the record.
  form_type?: FormType
  partner_type?: string
  source?: 'onboarding_form' | 'manual'
  created_by?: string
}

function fromRow(row: Record<string, unknown>) {
  return { ...row, company_name: row.name, company_website: row.website_url }
}

function hasValue(v: SubmittedValue | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0
  return !!v && v.trim().length > 0
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const type    = req.nextUrl.searchParams.get('type')
  const status  = req.nextUrl.searchParams.get('status')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_sponsors')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (type) q = q.eq('partner_type', type)
  if (status) q = q.eq('announcement_status', status)
  else q = q.neq('announcement_status', 'archived')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const socialPostStatus = await fetchPartnerSocialPostStatus((data ?? []).map(p => p.id))
  return NextResponse.json((data ?? []).map(row => ({
    ...fromRow(row),
    website_status: websiteStatus(row),
    social_post_status: socialPostStatus.get(row.id) ?? 'pending',
  })))
}

type TriState = 'pending' | 'created' | 'published'

// Same proxy/eligibility logic as the speakers route (KonfHub sync is
// shared, event_sponsors has the same status/active/konfhub_booking_id
// shape) — see that file's own doc comment for the full rationale.
function websiteStatus(row: { konfhub_booking_id: string | null; status: string; active: boolean }): TriState {
  if (row.konfhub_booking_id) return 'published'
  if (row.status === 'approved' && row.active === true) return 'created'
  return 'pending'
}

/* Roster "Social Post" column (2026-08-18 SAE-into-Hub merge, extended
   2026-08-23 to a 3-state Website/Social Post model matching the speakers
   roster — see that file's own doc comment). Self Promo is a deliberate
   speaker-only feature (no partner data model/routes for it), so this
   route never returns a self_promo_status field — the Hub roster only
   renders that column for speakers. One batched query for the whole
   roster rather than N+1 per partner. */
async function fetchPartnerSocialPostStatus(partnerIds: string[]): Promise<Map<string, TriState>> {
  const result = new Map<string, TriState>()
  if (partnerIds.length === 0) return result
  const { data } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('partner_id, status')
    .in('partner_id', partnerIds)

  const byPartner = new Map<string, string[]>()
  for (const a of data ?? []) {
    if (!a.partner_id) continue
    byPartner.set(a.partner_id, [...(byPartner.get(a.partner_id) ?? []), a.status])
  }
  for (const [partnerId, statuses] of byPartner) {
    result.set(partnerId, statuses.includes('published') ? 'published' : 'created')
  }
  return result
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as PartnerBody | null
  if (!body?.event_id || !body?.fields) {
    return NextResponse.json({ error: 'event_id and fields required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const formType: FormType = body.form_type ?? 'sponsor'
  const schema = await resolveFormSchema(body.event_id, formType)
  for (const f of schema) {
    // A required checkbox means "must be checked" — hasValue() alone would
    // also accept the explicit 'false' string a real unchecked box stores.
    const unsatisfied = f.type === 'checkbox' ? body.fields[f.key] !== 'true' : !hasValue(body.fields[f.key])
    if (f.required && f.type !== 'file' && unsatisfied) {
      return NextResponse.json({ error: `${f.label} is required` }, { status: 400 })
    }
  }

  const { columns, customFields } = mapFieldsToRecord(formType, schema, body.fields, {})

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .insert({ ...columns, event_id: body.event_id, custom_fields: customFields, partner_type: body.partner_type ?? 'sponsor', source: body.source ?? 'manual', created_by: body.created_by || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...fromRow(data), fields: recordToFields(formType, schema, data) }, { status: 201 })
}
