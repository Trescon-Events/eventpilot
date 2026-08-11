import { HubSpotForm, HubSpotFormField } from './types'

// Raw fetch, no HubSpot SDK — matches every other external integration in
// this codebase (Canva, Graph mail, PhotoRoom). Server-side only — reads
// HUBSPOT_API_KEY, a HubSpot Service Key with the `forms`,
// `forms-uploaded-files`, and `external_integrations.forms.access` scopes.

const HUBSPOT_API_BASE = 'https://api.hubapi.com'

function authHeaders(): Record<string, string> {
  const key = process.env.HUBSPOT_API_KEY
  if (!key) throw new Error('HUBSPOT_API_KEY not configured')
  return { Authorization: `Bearer ${key}` }
}

type HubSpotFormFieldGroup = { fields?: RawHubSpotField[] }
type RawHubSpotField = { name: string; label: string; fieldType: string; required?: boolean; hidden?: boolean }
type RawHubSpotForm = { id: string; name: string; fieldGroups?: HubSpotFormFieldGroup[] }

function flattenFields(data: RawHubSpotForm): HubSpotFormField[] {
  return (data.fieldGroups ?? []).flatMap(g =>
    (g.fields ?? []).map(f => ({
      name: f.name,
      label: f.label,
      fieldType: f.fieldType,
      required: !!f.required,
      hidden: !!f.hidden,
    }))
  )
}

export async function fetchHubSpotForm(formId: string): Promise<HubSpotForm> {
  const res = await fetch(`${HUBSPOT_API_BASE}/marketing/v3/forms/${formId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HubSpot form fetch failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as RawHubSpotForm
  return { id: data.id, name: data.name, fields: flattenFields(data) }
}

export async function listHubSpotForms(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${HUBSPOT_API_BASE}/marketing/v3/forms?limit=100`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HubSpot forms list failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { results?: { id: string; name: string }[] }
  return (data.results ?? []).map(f => ({ id: f.id, name: f.name }))
}
