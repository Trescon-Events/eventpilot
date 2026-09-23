import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FormType } from '@/app/lib/forms/types'
import { HubSpotFieldMapping } from '@/app/lib/hubspot/types'
import { fetchHubSpotForm } from '@/app/lib/hubspot/client'
import { suggestFieldMapping } from '@/app/lib/hubspot/suggest-field-mapping'

/* POST /api/events/stakeholders/hubspot/resync
   Body: { event_id, form_type }

   Re-fetches the connected form's fields from HubSpot and updates the
   cache, WITHOUT clearing the existing field_mapping — mapping entries
   whose hubspot_field_name no longer exists on the form are dropped, and
   their names are returned in removed_fields so the UI can warn the
   producer. Any field that's still unmapped after that (newly-added on
   HubSpot's side, or never mapped in the first place) gets a fresh pass
   through suggestFieldMapping() — same reference-event auto-suggest as
   .../connect, applied only to the still-unmapped subset so an existing,
   possibly producer-overridden mapping is never touched. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; form_type?: string } | null
  if (!body?.event_id || !body?.form_type) return NextResponse.json({ error: 'event_id and form_type required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: existing } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('hubspot_form_id, field_mapping')
    .eq('event_id', body.event_id).eq('form_type', body.form_type)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'No HubSpot form connected for this event/form type' }, { status: 404 })

  let hsForm
  try {
    hsForm = await fetchHubSpotForm(existing.hubspot_form_id)
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch that HubSpot form: ${(e as Error).message}` }, { status: 400 })
  }

  const liveFieldNames = new Set(hsForm.fields.map(f => f.name))
  const priorMapping = (existing.field_mapping ?? []) as HubSpotFieldMapping[]
  const keptMapping = priorMapping.filter(m => liveFieldNames.has(m.hubspot_field_name))
  const removedFields = priorMapping.filter(m => !liveFieldNames.has(m.hubspot_field_name)).map(m => m.hubspot_field_name)

  const mappedFieldNames = new Set(keptMapping.map(m => m.hubspot_field_name))
  const unmappedFields = hsForm.fields.filter(f => !mappedFieldNames.has(f.name))
  const suggestions = unmappedFields.length
    ? await suggestFieldMapping(unmappedFields, body.event_id, body.form_type as FormType)
    : []
  const finalMapping = [...keptMapping, ...suggestions]

  const { data, error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .update({
      hubspot_form_name: hsForm.name,
      cached_fields: hsForm.fields,
      fields_synced_at: new Date().toISOString(),
      field_mapping: finalMapping,
      updated_at: new Date().toISOString(),
    })
    .eq('event_id', body.event_id).eq('form_type', body.form_type)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, removed_fields: removedFields })
}
