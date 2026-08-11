import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { FormType, FORM_TYPES, RESERVED_FIELD_KEYS } from '@/app/lib/forms/types'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { HubSpotFieldMapping } from '@/app/lib/hubspot/types'

/* PUT /api/events/stakeholders/hubspot/mapping
   Body: { event_id, form_type, field_mapping: HubSpotFieldMapping[] }

   Saves the human-authored HubSpot field -> EventPilot concept mapping.
   Every `concept` target key is validated against a LIVE
   resolveFormSchema(event_id, form_type) call — the same function
   from-submission already uses — so a mapping can never point at a
   concept key that doesn't actually exist for this event's resolved
   schema (event override > global default > hardcoded fallback). */

const ASSET_ROLES = ['photo', 'company_logo', 'logo']
const SECURE_ROLES = ['passport', 'national_id', 'other_document']

function validateMapping(mapping: unknown, conceptKeys: Set<string>): string | null {
  if (!Array.isArray(mapping)) return 'field_mapping must be an array'
  const seenHubSpotFields = new Set<string>()
  for (const m of mapping as HubSpotFieldMapping[]) {
    if (!m || typeof m !== 'object' || !m.hubspot_field_name) return 'Invalid mapping entry'
    if (seenHubSpotFields.has(m.hubspot_field_name)) return `Duplicate mapping for HubSpot field: ${m.hubspot_field_name}`
    seenHubSpotFields.add(m.hubspot_field_name)
    if (!m.target || typeof m.target !== 'object') return `Missing target for HubSpot field: ${m.hubspot_field_name}`
    switch (m.target.type) {
      case 'concept':
        if (!m.target.key || !conceptKeys.has(m.target.key)) return `"${m.target.key}" isn't a valid field on this event's resolved form schema`
        if (RESERVED_FIELD_KEYS.includes(m.target.key)) return `"${m.target.key}" is a reserved key`
        break
      case 'asset':
        if (!ASSET_ROLES.includes(m.target.role)) return `Invalid asset role: ${m.target.role}`
        break
      case 'secure_document':
        if (!SECURE_ROLES.includes(m.target.role)) return `Invalid secure document role: ${m.target.role}`
        break
      case 'custom':
        break
      default:
        return `Unknown target type for HubSpot field: ${m.hubspot_field_name}`
    }
  }
  return null
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; form_type?: string; field_mapping?: HubSpotFieldMapping[] } | null
  if (!body?.event_id || !body?.form_type || !body?.field_mapping) {
    return NextResponse.json({ error: 'event_id, form_type, and field_mapping required' }, { status: 400 })
  }
  if (!FORM_TYPES.includes(body.form_type as FormType)) return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const schema = await resolveFormSchema(body.event_id, body.form_type as FormType)
  const conceptKeys = new Set(schema.filter(f => f.type !== 'file').map(f => f.key))

  const err = validateMapping(body.field_mapping, conceptKeys)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_hubspot_forms')
    .update({ field_mapping: body.field_mapping, updated_at: new Date().toISOString() })
    .eq('event_id', body.event_id).eq('form_type', body.form_type)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
