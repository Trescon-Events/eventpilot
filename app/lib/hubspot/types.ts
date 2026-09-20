// HubSpot Forms integration (2026-08-11), Phase A of the SAE
// producer-workflow initiative's move to HubSpot-hosted onboarding forms.

import { FieldType } from '@/app/lib/forms/types'

export type HubSpotFormFieldOption = { label: string; value: string }

export type HubSpotFormField = {
  name: string
  label: string
  fieldType: string
  required: boolean
  hidden: boolean
  options?: HubSpotFormFieldOption[]   // dropdown/checkbox/radio only
  // Set only for a field nested under another field's `dependentFields` in
  // HubSpot's own API response (e.g. "Assistant Email" only appears once
  // "Would you like us to coordinate with your assistant?" = Yes) — see
  // flattenFields() in client.ts. Purely informational here: EventPilot
  // still always writes/reads this field's mapping the same as any other;
  // this just tells the mapping page's producer it isn't always collected.
  dependsOn?: { parentLabel: string; values: string[] }
}

// HubSpot's own field-type vocabulary -> ours. Used only to pre-fill the
// mapping page's "+ Create new field" draft (type + options + required) so
// a producer creating an EventPilot field to match e.g. a HubSpot dropdown
// doesn't have to re-pick the type or retype every option by hand — see
// hubspot-form/[formType]/page.tsx. Best-effort: HubSpot has fieldTypes we
// have no equivalent for (number); those fall back to 'text', a safe
// default the producer can still override before confirming.
const HUBSPOT_FIELD_TYPE_MAP: Record<string, FieldType> = {
  single_line_text: 'text',
  multi_line_text: 'textarea',
  email: 'email',
  phone: 'phone',
  dropdown: 'select',
  radio: 'select',
  checkbox: 'multiselect',      // a GROUP of checkboxes (pick any of several options)
  single_checkbox: 'checkbox',  // ONE yes/no consent box — e.g. "I agree to..."
  date: 'date',
  file: 'file',
}

export function guessFieldTypeFromHubSpot(hubspotFieldType: string): FieldType {
  return HUBSPOT_FIELD_TYPE_MAP[hubspotFieldType] ?? 'text'
}

// The CRM Properties API (crm/v3/properties/...) uses a DIFFERENT fieldType
// vocabulary than the Forms API above — confirmed live 2026-09-19: the same
// "Country" property reports fieldType 'select' here vs 'dropdown' on a
// form. Reusing HUBSPOT_FIELD_TYPE_MAP for property-definition sync
// silently produced wrong types (select/phonenumber both fell through to
// the 'text' default) — this is the separate map that vocabulary needs.
const HUBSPOT_PROPERTY_FIELD_TYPE_MAP: Record<string, FieldType> = {
  text: 'text',
  textarea: 'textarea',
  html: 'textarea',
  select: 'select',
  radio: 'select',
  checkbox: 'multiselect',       // multi-select checkbox group (enumeration, several values)
  booleancheckbox: 'checkbox',   // single yes/no
  phonenumber: 'phone',
  date: 'date',
  file: 'file',
}

export function guessFieldTypeFromHubSpotProperty(hubspotFieldType: string): FieldType {
  return HUBSPOT_PROPERTY_FIELD_TYPE_MAP[hubspotFieldType] ?? 'text'
}

export type HubSpotForm = {
  id: string
  name: string
  fields: HubSpotFormField[]
}

// Explicit, human-authored — never inferred. A producer/admin maps each
// real HubSpot field to one of these targets after inspecting the
// connected form's actual fields (see app/lib/hubspot/client.ts).
export type HubSpotFieldMapping = {
  hubspot_field_name: string
  hubspot_label: string
  target:
    | { type: 'concept'; key: string }                                  // key validated live against resolveFormSchema(event, form_type)
    | { type: 'asset'; role: 'photo' | 'company_logo' | 'logo' | 'bio_full' }  // bio_full added 2026-09-19 — see from-submission route's own comment for why it needs the same Word->PDF conversion the native form's upload already gets, not just a raw re-host like company_logo/logo
    | { type: 'custom' }                                                // passthrough — lands in submitted_data[hubspot_field_name]. Labeled "Consent checkboxes" on the mapping page (2026-09-19) since that's its real usage in practice — still just inert per-speaker storage, no special handling.
    | { type: 'crm_property'; entity_type: 'contact' | 'company'; property_key: string }  // routes into the cross-event CRM layer (crm_contacts/crm_companies), not just this event's record — see app/lib/crm/upsert.ts
    | { type: 'sensitive_document'; document_type: 'passport' | 'national_id' }  // private-bucket pipeline (app/lib/events/sensitive-storage.ts), NOT the public asset bucket — see speaker from-submission route
}

export type EventHubSpotForm = {
  id: string
  event_id: string
  form_type: string
  hubspot_form_id: string
  hubspot_form_name: string | null
  cached_fields: HubSpotFormField[] | null
  fields_synced_at: string | null
  field_mapping: HubSpotFieldMapping[]
  connected_by: string | null
  connected_at: string
  updated_at: string
  hubspot_workflow_id: string | null
  hubspot_workflow_created_at: string | null
}
