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
type RawHubSpotField = {
  name: string; label: string; fieldType: string; required?: boolean; hidden?: boolean
  options?: { label: string; value: string }[]
}
type RawHubSpotForm = { id: string; name: string; fieldGroups?: HubSpotFormFieldGroup[] }

function flattenFields(data: RawHubSpotForm): HubSpotFormField[] {
  return (data.fieldGroups ?? []).flatMap(g =>
    (g.fields ?? []).map(f => ({
      name: f.name,
      label: f.label,
      fieldType: f.fieldType,
      required: !!f.required,
      hidden: !!f.hidden,
      options: f.options?.length ? f.options.map(o => ({ label: o.label, value: o.value })) : undefined,
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

// Uploaded-file signed-url-redirect links (a submission's photo/logo file
// URL, as stored in stakeholder_form_submissions.file_urls) — unlike the
// form/field-definition endpoints above, this one 307-redirects to
// HubSpot's own login page instead of the actual file when fetched without
// auth, even moments after submission (confirmed live, 2026-08-15 — NOT a
// signed-URL-expiry issue; the redirect endpoint itself requires an
// authenticated HubSpot request, the same Service Key works here since
// `forms-uploaded-files` is one of its granted scopes). Every from-
// submission conversion route that re-hosts/processes a submitted
// photo/logo must fetch through this, not a bare fetch(), or the "photo"
// it ends up storing is HubSpot's login-page HTML. Only the FIRST hop gets
// this header — the redirect target (HubSpot's CDN) carries its own signed
// query-string params and doesn't need it, so nothing leaks cross-origin.
export async function fetchHubSpotUploadedFile(url: string): Promise<Response> {
  // Bounded (2026-08-24) — this previously had no timeout at all. Its only
  // caller today (from-submission/route.ts) runs behind the same Cloudflare
  // proxy in front of production that kills any single request around
  // ~100s; an unbounded hang here (dead redirect, slow HubSpot response)
  // shouldn't be able to run past that.
  return fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) })
}
