import { supabaseAdmin } from '@/app/lib/supabase'
import type { HubSpotFieldMapping } from '@/app/lib/hubspot/types'
import type { SubmittedValue } from '@/app/lib/forms/types'
import { fetchCommunicationConsentStatuses, LEGAL_CONSENT_FIELD_PREFIX } from '@/app/lib/hubspot/client'

/* HubSpot form submission -> EventPilot row. Shared by the workflow webhook (the normal path) and the gap check's "bring it in" (the safety net),
   so a row built either way is identical. */

/** A failed delivery leaves a trace here (the Sync health card reads it); never throws. */
export async function logWebhookError(hubspotFormId: string | null, stage: string, message: string): Promise<void> {
  const { error } = await supabaseAdmin.from('hubspot_webhook_errors').insert({ hubspot_form_id: hubspotFormId, stage, message: message.slice(0, 500) })
  if (error) console.error('[hubspot-webhook] could not log error:', error.message)
}

/** Legal-consent checkboxes never arrive as properties — HubSpot tracks them as a subscription record. For any field mapped that way, look the live status up
    by email and add it under the same synthetic name. A failed lookup must never lose the submission: the consent answer is left out and the failure is logged. */
export async function addConsentValues(formId: string, mapping: HubSpotFieldMapping[], properties: Record<string, string | undefined>): Promise<void> {
  const names = mapping.map(m => m.hubspot_field_name).filter(n => n.startsWith(LEGAL_CONSENT_FIELD_PREFIX))
  if (!names.length || !properties.email) return
  try {
    const statuses = await fetchCommunicationConsentStatuses(properties.email)
    for (const name of names) {
      const id = name.slice(LEGAL_CONSENT_FIELD_PREFIX.length)
      if (statuses.has(id)) properties[name] = statuses.get(id) ? 'true' : 'false'
    }
  } catch (e) {
    await logWebhookError(formId, 'consent_lookup', e instanceof Error ? e.message : 'consent lookup failed')
  }
}

/** Applies the form's field mapping to a submission's values. */
export function applyMapping(mapping: HubSpotFieldMapping[], properties: Record<string, string | undefined>): { submittedData: Record<string, SubmittedValue>; fileUrls: Record<string, string> } {
  const submittedData: Record<string, SubmittedValue> = {}
  const fileUrls: Record<string, string> = {}
  for (const m of mapping) {
    const value = properties[m.hubspot_field_name]
    if (value === undefined || value === null || value === '') continue
    switch (m.target.type) {
      case 'concept':
        submittedData[m.target.key] = value
        break
      case 'asset':
        fileUrls[m.target.role] = value
        break
      case 'sensitive_document':
        // Same bucket as 'asset' (a file-upload field's value is a URL either way); the speaker from-submission route tells passport/national_id from photo/logo.
        fileUrls[m.target.document_type] = value
        break
      case 'custom':
        submittedData[m.hubspot_field_name] = value
        break
      case 'crm_property':
        // Read back by app/lib/crm/upsert.ts's extractCrmPropertyValue(); ALSO written under the plain property name so one "CRM property" choice
        // satisfies both this event's record and the cross-event CRM (Madhu, 2026-09-19).
        submittedData[`crm__${m.target.entity_type}__${m.target.property_key}`] = value
        submittedData[m.target.property_key] = value
        break
    }
  }
  return { submittedData, fileUrls }
}
