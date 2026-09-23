import { supabaseAdmin } from '@/app/lib/supabase'
import { FormType, RESERVED_FIELD_KEYS } from '@/app/lib/forms/types'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { HubSpotFieldMapping, HubSpotFormField } from './types'

// AI InfraNext Indonesia 2026 — the first event whose speaker form was fully,
// carefully hand-mapped. Its mapping is used as the reference set for
// auto-suggesting mappings on every newly-connected form: HubSpot's own
// internal names for standard contact properties (firstname, jobtitle,
// email, ...) are stable across every Trescon form built from them, so an
// exact hubspot_field_name match against this reference reliably catches
// the standard fields and correctly leaves event-specific custom fields
// (whose internal names HubSpot auto-generates from that form's own
// question text) for manual mapping. See HANDOFF.md 2026-09-22.
const REFERENCE_EVENT_ID = '0cbcb583-b023-477d-b4c1-264e85d20e57'

/* Suggests a field_mapping for a newly-connected HubSpot form by matching
   each of its fields' hubspot_field_name against the reference event's
   already-mapped fields for the same form_type. Every suggestion is
   re-validated against THIS event's own resolved schema / CRM property
   registry before being included — a reference target that doesn't
   resolve here (e.g. a concept key this event's schema doesn't have) is
   silently dropped rather than suggested, same as if it were never
   matched. Fields with no match in the reference set are left out
   entirely, exactly like an unmapped field today — the producer maps
   them manually on the mapping page. */
export async function suggestFieldMapping(
  fields: HubSpotFormField[],
  eventId: string,
  formType: FormType
): Promise<HubSpotFieldMapping[]> {
  if (eventId === REFERENCE_EVENT_ID) return []

  const { data: referenceRow } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('field_mapping')
    .eq('event_id', REFERENCE_EVENT_ID)
    .eq('form_type', formType)
    .maybeSingle()

  const referenceMapping = (referenceRow?.field_mapping ?? []) as HubSpotFieldMapping[]
  if (referenceMapping.length === 0) return []

  const referenceByFieldName = new Map(referenceMapping.map(m => [m.hubspot_field_name, m]))

  const schema = await resolveFormSchema(eventId, formType)
  const conceptKeys = new Set(schema.filter(f => f.type !== 'file').map(f => f.key))
  const { data: crmProps } = await supabaseAdmin.from('crm_properties').select('entity_type, property_key')
  const crmPropertyKeys = new Set((crmProps ?? []).map(p => `${p.entity_type}:${p.property_key}`))

  const suggestions: HubSpotFieldMapping[] = []
  for (const field of fields) {
    const ref = referenceByFieldName.get(field.name)
    if (!ref) continue

    switch (ref.target.type) {
      case 'concept':
        if (!conceptKeys.has(ref.target.key) || RESERVED_FIELD_KEYS.includes(ref.target.key)) continue
        break
      case 'crm_property':
        if (!crmPropertyKeys.has(`${ref.target.entity_type}:${ref.target.property_key}`)) continue
        break
      // asset / sensitive_document / custom targets are fixed enums with no
      // per-event dependency — always safe to carry over as-is.
    }

    suggestions.push({ hubspot_field_name: field.name, hubspot_label: field.label, target: ref.target })
  }
  return suggestions
}
