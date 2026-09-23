import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FormType, FORM_TYPES } from '@/app/lib/forms/types'
import { fetchHubSpotForm } from '@/app/lib/hubspot/client'
import { suggestFieldMapping } from '@/app/lib/hubspot/suggest-field-mapping'

/* POST /api/events/stakeholders/hubspot/connect
   Body: { event_id, form_type, hubspot_form_id }

   Connects a HubSpot form to this event+form_type: fetches its real field
   definitions via the HubSpot API, caches them, and creates the row with
   field_mapping pre-filled for any field that matches the reference
   event's mapping (see suggest-field-mapping.ts) — fields with no match
   are left unmapped, same as before, for the producer to map next (PUT
   .../mapping). Re-running this (e.g. to fix a wrong form_id) replaces
   the row entirely, including clearing any prior mapping — use POST
   .../resync instead to refresh fields while preserving an existing
   mapping. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; form_type?: string; hubspot_form_id?: string } | null
  if (!body?.event_id || !body?.form_type || !body?.hubspot_form_id) {
    return NextResponse.json({ error: 'event_id, form_type, and hubspot_form_id required' }, { status: 400 })
  }
  if (!FORM_TYPES.includes(body.form_type as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let hsForm
  try {
    hsForm = await fetchHubSpotForm(body.hubspot_form_id)
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch that HubSpot form: ${(e as Error).message}` }, { status: 400 })
  }

  const suggestedMapping = await suggestFieldMapping(hsForm.fields, body.event_id, body.form_type as FormType)

  const { data, error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .upsert(
      {
        event_id: body.event_id,
        form_type: body.form_type,
        hubspot_form_id: hsForm.id,
        hubspot_form_name: hsForm.name,
        cached_fields: hsForm.fields,
        fields_synced_at: new Date().toISOString(),
        field_mapping: suggestedMapping,
        connected_by: session?.sid ?? null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,form_type' }
    )
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
