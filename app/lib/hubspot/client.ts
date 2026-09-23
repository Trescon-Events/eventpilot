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
  // Conditional-logic fields (HubSpot's "Logic" tab, e.g. "only show
  // Assistant Email if the Yes/No question above is answered Yes") — these
  // never appear as their own top-level fieldGroups entry, only nested
  // here under the field that gates them. A dependent can itself gate
  // further dependents, so this recurses.
  dependentFields?: { dependentCondition: { values: string[] }; dependentField: RawHubSpotField }[]
}
type RawHubSpotForm = {
  id: string
  name: string
  fieldGroups?: HubSpotFormFieldGroup[]
  // HubSpot's native "Legal consent" block (GDPR communications-subscription
  // checkboxes) — a genuinely separate structure from fieldGroups, not a
  // regular field. Confirmed live 2026-09-22: DFS's speaker form uses this
  // (type "implicit_consent_to_process") while AI InfraNext's equivalent
  // "consent" checkboxes are plain single_checkbox fields built directly
  // into fieldGroups (legalConsentOptions.type "none" there) — same visual
  // checkbox to a submitter, two unrelated HubSpot data shapes.
  legalConsentOptions?: { type: string; communicationsCheckboxes?: { required?: boolean; subscriptionTypeId: number; label: string }[] }
}

// Synthesizes a normal-looking HubSpotFormField for each legal-consent
// checkbox so it shows up on the mapping page like any other field. The
// name is a stable, parseable key (LEGAL_CONSENT_FIELD_PREFIX + the
// subscriptionTypeId) — the submissions webhook route greps for this
// prefix to know which mapped fields need a live Communication
// Preferences lookup, since (unlike every other field) HubSpot never
// includes this value in "include all triggered contact properties";
// it's tracked as a subscription record, not a contact property.
export const LEGAL_CONSENT_FIELD_PREFIX = 'hs_legal_consent_'

function legalConsentFields(data: RawHubSpotForm): HubSpotFormField[] {
  return (data.legalConsentOptions?.communicationsCheckboxes ?? []).map(c => ({
    name: `${LEGAL_CONSENT_FIELD_PREFIX}${c.subscriptionTypeId}`,
    label: c.label,
    fieldType: 'single_checkbox',
    required: !!c.required,
    hidden: false,
  }))
}

function toFlatField(f: RawHubSpotField, dependsOn?: { parentLabel: string; values: string[] }): HubSpotFormField[] {
  const flat: HubSpotFormField = {
    name: f.name,
    label: f.label,
    fieldType: f.fieldType,
    required: !!f.required,
    hidden: !!f.hidden,
    options: f.options?.length ? f.options.map(o => ({ label: o.label, value: o.value })) : undefined,
    ...(dependsOn ? { dependsOn } : {}),
  }
  const children = (f.dependentFields ?? []).flatMap(d =>
    toFlatField(d.dependentField, { parentLabel: f.label, values: d.dependentCondition.values })
  )
  return [flat, ...children]
}

// Every top-level field, PLUS every field nested under another field's
// "Logic" conditional-display rules (dependentFields) — those are real,
// mappable fields on the live form (HubSpot just doesn't list them at the
// top level since they only appear to a submitter conditionally). See
// this event's own "Assistant Email/Mobile/Full name" fields, only shown
// when "Would you like us to coordinate with your assistant?" = Yes,
// confirmed live 2026-09-18 to be missing from this flattening entirely
// before this fix — a re-sync would have silently dropped their mapping.
function flattenFields(data: RawHubSpotForm): HubSpotFormField[] {
  return (data.fieldGroups ?? []).flatMap(g => (g.fields ?? []).flatMap(f => toFlatField(f)))
}

export async function fetchHubSpotForm(formId: string): Promise<HubSpotForm> {
  const res = await fetch(`${HUBSPOT_API_BASE}/marketing/v3/forms/${formId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HubSpot form fetch failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as RawHubSpotForm
  return { id: data.id, name: data.name, fields: [...flattenFields(data), ...legalConsentFields(data)] }
}

// Per-contact status for every legal-consent subscription on a form —
// GET /communication-preferences/v3/status/email/{email}, HubSpot's real
// source of truth for "did this person opt in," since a legal-consent
// checkbox never lands in a contact's regular properties. Best-effort:
// returns an empty map (never throws) on any failure — a submission with
// no readable consent status should still land in the Submissions Inbox
// with everything else filled in rather than being dropped entirely.
export async function fetchCommunicationConsentStatuses(email: string): Promise<Map<string, boolean>> {
  const statuses = new Map<string, boolean>()
  try {
    const res = await fetch(`${HUBSPOT_API_BASE}/communication-preferences/v3/status/email/${encodeURIComponent(email)}`, { headers: authHeaders() })
    if (!res.ok) return statuses
    const data = (await res.json()) as { subscriptionStatuses?: { id: string; status: string }[] }
    for (const s of data.subscriptionStatuses ?? []) statuses.set(String(s.id), s.status === 'SUBSCRIBED')
  } catch {
    // network/timeout — same best-effort contract as above
  }
  return statuses
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
