// HubSpot CRM Sync client — Phase 2. Separate Service Key from
// app/lib/hubspot/client.ts's forms-only HUBSPOT_API_KEY (least-privilege:
// this one only carries CRM scopes — contacts/companies/custom
// objects/association-label-schema — never `forms`).
//
// Forward-only, manually triggered (see /admin/crm sync action) — this
// module never touches the ~66k legacy `Attendees` custom-object records;
// per Madhu 2026-09-16, no historical data gets backfilled into any sync,
// here or elsewhere. It only pushes CRM contacts/companies a producer
// explicitly syncs from EventPilot's own crm_contacts/crm_companies.
//
// Object type IDs are this portal's (2953901) only — hardcoded like
// HUBSPOT_PORTAL_ID already is elsewhere in this codebase, not worth an env
// var for a single-portal integration.
export const HUBSPOT_OBJECT_TYPE = {
  contact: 'contacts',
  company: 'companies',
  event: '2-16202870', // custom object "Events" (p2953901_events)
} as const

const HUBSPOT_API_BASE = 'https://api.hubapi.com'

function authHeaders(): Record<string, string> {
  const key = process.env.HUBSPOT_CRM_SERVICE_KEY
  if (!key) throw new Error('HUBSPOT_CRM_SERVICE_KEY not configured')
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function hubspotFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${HUBSPOT_API_BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`HubSpot API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${await res.text()}`)
  return res
}

async function searchByProperty(objectType: string, propertyName: string, value: string, properties: string[]): Promise<{ id: string } | null> {
  const res = await hubspotFetch(`/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
      properties,
      limit: 1,
    }),
  })
  const data = (await res.json()) as { results?: { id: string }[] }
  return data.results?.[0] ?? null
}

// Search-by-email, create-if-absent, patch-if-found — the only two paths a
// manual "Sync to HubSpot" click can take. Never deletes/archives anything.
export async function upsertHubSpotContact(email: string, properties: Record<string, string | null>): Promise<{ id: string; isNew: boolean }> {
  const existing = await searchByProperty(HUBSPOT_OBJECT_TYPE.contact, 'email', email, ['email'])
  const cleanProps = Object.fromEntries(Object.entries({ email, ...properties }).filter(([, v]) => v != null))
  if (existing) {
    await hubspotFetch(`/crm/v3/objects/contacts/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ properties: cleanProps }) })
    return { id: existing.id, isNew: false }
  }
  const res = await hubspotFetch('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties: cleanProps }) })
  const created = (await res.json()) as { id: string }
  return { id: created.id, isNew: true }
}

export async function upsertHubSpotCompany(domain: string, properties: Record<string, string | null>): Promise<{ id: string; isNew: boolean }> {
  const existing = await searchByProperty(HUBSPOT_OBJECT_TYPE.company, 'domain', domain, ['domain'])
  const cleanProps = Object.fromEntries(Object.entries({ domain, ...properties }).filter(([, v]) => v != null))
  if (existing) {
    await hubspotFetch(`/crm/v3/objects/companies/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ properties: cleanProps }) })
    return { id: existing.id, isNew: false }
  }
  const res = await hubspotFetch('/crm/v3/objects/companies', { method: 'POST', body: JSON.stringify({ properties: cleanProps }) })
  const created = (await res.json()) as { id: string }
  return { id: created.id, isNew: true }
}

// Find-or-create the HubSpot Events custom-object record standing in for a
// given EventPilot event — matched by exact name (the only identifying
// field both sides agree on; there's no hubspot_event_id column yet).
export async function findOrCreateHubSpotEvent(eventName: string): Promise<string> {
  const existing = await searchByProperty(HUBSPOT_OBJECT_TYPE.event, 'event_name', eventName, ['event_name'])
  if (existing) return existing.id
  const res = await hubspotFetch(`/crm/v3/objects/${HUBSPOT_OBJECT_TYPE.event}`, {
    method: 'POST',
    body: JSON.stringify({ properties: { event_name: eventName } }),
  })
  const created = (await res.json()) as { id: string }
  return created.id
}

// Association Labels — HubSpot's role-tracking mechanism (replaces the old
// Attendees-object-as-role-tracker pattern the Phase 2 design plan called
// out). `name` must be a unique, lowercase/underscore key per object-type
// pair; `label` is the human-readable one shown in the HubSpot UI.
export async function ensureAssociationLabel(fromObjectType: string, toObjectType: string, name: string, label: string): Promise<number> {
  const listRes = await hubspotFetch(`/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`)
  // HubSpot's list endpoint only echoes `label` (the display string), never
  // the `name` key used to create it — so dedup-matching has to be by label.
  const existing = (await listRes.json()) as { results?: { typeId: number; label: string | null }[] }
  const found = existing.results?.find(r => r.label === label)
  if (found) return found.typeId

  // Create returns typeIds for BOTH directions (from->to and to->from) in
  // one call, unordered w.r.t. which is which — re-list (same endpoint the
  // dedup check above used, already scoped to this exact direction by the
  // URL) rather than trust the create response's ordering.
  await hubspotFetch(`/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`, {
    method: 'POST',
    body: JSON.stringify({ label, name }),
  })
  const refetch = await hubspotFetch(`/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`)
  const refetched = (await refetch.json()) as { results?: { typeId: number; label: string | null }[] }
  const typeId = refetched.results?.find(r => r.label === label)?.typeId
  if (!typeId) throw new Error(`HubSpot association label create returned no typeId for ${fromObjectType}->${toObjectType}/${name}`)
  return typeId
}

export async function associateWithLabel(fromObjectType: string, fromId: string, toObjectType: string, toId: string, associationTypeId: number): Promise<void> {
  await hubspotFetch(`/crm/v4/objects/${fromObjectType}/${fromId}/associations/${toObjectType}/${toId}`, {
    method: 'PUT',
    body: JSON.stringify([{ associationCategory: 'USER_DEFINED', associationTypeId }]),
  })
}

// Pull direction (Phase 3) — batch-read is the only pull primitive this
// portal's Service Key needs: it's used ONLY against ids we already stored
// on our own crm_contacts/crm_companies rows (records we ourselves pushed),
// never a blanket poll of the object type — that would reach into the same
// unrelated/historical HubSpot data this integration deliberately never
// touches (see HUBSPOT_OBJECT_TYPE's own comment). Silently drops any id
// HubSpot doesn't recognize (deleted/merged on their side) rather than
// failing the whole batch — `results` just won't include it.
export async function batchReadContacts(ids: string[], properties: string[]): Promise<{ id: string; properties: Record<string, string | null> }[]> {
  if (ids.length === 0) return []
  const res = await hubspotFetch('/crm/v3/objects/contacts/batch/read', {
    method: 'POST',
    body: JSON.stringify({ properties, inputs: ids.map(id => ({ id })) }),
  })
  const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] }
  return data.results ?? []
}

export async function batchReadCompanies(ids: string[], properties: string[]): Promise<{ id: string; properties: Record<string, string | null> }[]> {
  if (ids.length === 0) return []
  const res = await hubspotFetch('/crm/v3/objects/companies/batch/read', {
    method: 'POST',
    body: JSON.stringify({ properties, inputs: ids.map(id => ({ id })) }),
  })
  const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] }
  return data.results ?? []
}

// Property DEFINITION (label, field type, dropdown options) — not a
// contact/company record. Backs the crm_properties "stay in sync with
// HubSpot" requirement (2026-09-19, Madhu): if someone edits an option on
// e.g. Industry Sector directly in HubSpot, this is what re-reads that
// definition so EventPilot's own copy (crm_properties.options) can mirror
// it, rather than only ever tracking submitted VALUES like the rest of
// this file does. Same Service Key works here — confirmed live it already
// carries read access to standard Contact/Company property schemas, no
// separate scope needed.
export type HubSpotPropertyDefinition = {
  label: string
  fieldType: string
  options: { label: string; value: string }[]
}
export async function fetchHubSpotPropertyDefinition(entityType: 'contact' | 'company', propertyName: string): Promise<HubSpotPropertyDefinition> {
  const res = await hubspotFetch(`/crm/v3/properties/${HUBSPOT_OBJECT_TYPE[entityType]}/${propertyName}`)
  const data = (await res.json()) as { label: string; fieldType: string; options?: { label: string; value: string }[] }
  return { label: data.label, fieldType: data.fieldType, options: data.options ?? [] }
}
