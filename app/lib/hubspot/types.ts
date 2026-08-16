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
    | { type: 'asset'; role: 'photo' | 'company_logo' | 'logo' }         // fixed 3-value enum — matches exactly what PhotoRoom/processLogo() key off today
    | { type: 'secure_document'; role: 'passport' | 'national_id' | 'other_document' }
    | { type: 'custom' }                                                // passthrough — lands in submitted_data[hubspot_field_name]
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
}
