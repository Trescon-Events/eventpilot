// HubSpot Forms integration (2026-08-11), Phase A of the SAE
// producer-workflow initiative's move to HubSpot-hosted onboarding forms.

export type HubSpotFormField = {
  name: string
  label: string
  fieldType: string
  required: boolean
  hidden: boolean
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
