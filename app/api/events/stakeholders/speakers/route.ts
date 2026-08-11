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
  return NextResponse.json((data ?? []).map(fromRow))
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
    if (f.required && f.type !== 'file' && !hasValue(body.fields[f.key])) {
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
