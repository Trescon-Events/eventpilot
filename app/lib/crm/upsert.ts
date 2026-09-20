// CRM layer — Phase 1 upsert helpers, shared by the onboarding
// from-submission routes (speakers, partners) AND (2026-09-19) the manual
// Stakeholder Hub Add/Edit routes — a producer typing a speaker's details
// in by hand needs the same CRM contact creation/property sync a HubSpot
// submission gets, see syncSpeakerCrmContact() below. Dedup approach
// mirrors SmartData's proven sd_contact_records/sd_company_records pattern
// (unique lower(email) / lower(domain)) rather than inventing a new one —
// see supabase/crm_objects_migration.sql for the actual unique indexes.
//
// Forward-only in a different sense than "new submissions only" now: this
// still never runs as a bulk pass over old, untouched records — it only
// ever fires when a record is actively being created or saved (a producer
// editing it right now), never a scheduled backfill sweep. See
// feedback_no_historical_backfill_sync memory.

import { supabaseAdmin } from '@/app/lib/supabase'
import { FieldSchema, SubmittedValue } from '@/app/lib/forms/types'

// A HubSpot field explicitly mapped to a CRM property (the new
// 'crm_property' target type on the form-mapping page) — see
// app/api/public/hubspot/submissions/route.ts for where this synthetic key
// gets written into submitted_data. Always takes priority when present:
// it's an explicit human choice, not an inference.
export function extractCrmPropertyValue(entityType: 'contact' | 'company', propertyKey: string, submitted: Record<string, SubmittedValue>): string | null {
  const value = submitted[`crm__${entityType}__${propertyKey}`]
  const str = Array.isArray(value) ? value[0] : value
  return str && str.trim() ? str.trim() : null
}

// Schema-driven fallback for when no explicit crm_property mapping exists
// yet — works whether the email field is keyed 'email' (a HubSpot 'custom'
// mapping using HubSpot's own internal property name) or something else
// entirely on a producer-customized per-event schema. Takes the first
// field of type 'email' with a non-empty submitted value.
export function extractEmailFromSubmission(schema: FieldSchema[], submitted: Record<string, SubmittedValue>): string | null {
  const explicit = extractCrmPropertyValue('contact', 'email', submitted)
  if (explicit) return explicit
  for (const field of schema) {
    if (field.type !== 'email') continue
    const value = submitted[field.key]
    const str = Array.isArray(value) ? value[0] : value
    if (str && str.trim()) return str.trim()
  }
  return null
}

// Bare lowercase registrable-ish domain from a free-typed website URL —
// same shape of value SmartData's sd_company_records.domain already stores.
// Accepts values with or without a protocol ("acme.com", "www.acme.com",
// "https://acme.com/about").
export function extractDomain(url: string | undefined | null): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const host = new URL(withProtocol).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return null
  }
}

function splitName(fullName: string | undefined): { firstName: string | null; lastName: string | null } {
  if (!fullName?.trim()) return { firstName: null, lastName: null }
  const parts = fullName.trim().split(/\s+/)
  return { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(' ') : null }
}

export type UpsertResult = { id: string; isNew: boolean }

// `description`/`logoUrl` (mirroring `bio`/`photoUrl` on the contact side)
// are seeded ONLY on first create — a stable master/default baseline for
// future events to prefill from, never overwritten by a later submission's
// own event-specific values. See setCrmCompanyLogoIfEmpty() for the
// post-processing companion (the final logo isn't known until after any
// HubSpot re-hosting/processing completes, same as the contact photo case).
export async function upsertCrmCompany(input: {
  name: string; website?: string | null; domain?: string | null
  description?: string | null; logoUrl?: string | null
}): Promise<UpsertResult> {
  const domain = input.domain ?? extractDomain(input.website)

  if (domain) {
    const { data: existing } = await supabaseAdmin
      .from('crm_companies')
      .select('id')
      .ilike('domain', domain)
      .maybeSingle()
    if (existing) return { id: existing.id, isNew: false }
  }

  const { data: created, error } = await supabaseAdmin
    .from('crm_companies')
    .insert({
      name: input.name, website: input.website ?? null, domain,
      description: input.description ?? null, logo_url: input.logoUrl ?? null,
    })
    .select('id')
    .single()
  // A concurrent submission for the same domain can race this check-then-
  // insert — the unique index catches it; fall back to the row it kept.
  if (error?.code === '23505' && domain) {
    const { data: winner } = await supabaseAdmin.from('crm_companies').select('id').ilike('domain', domain).single()
    if (winner) return { id: winner.id, isNew: false }
  }
  if (error || !created) throw error ?? new Error('crm_companies insert returned no row')
  return { id: created.id, isNew: true }
}

// Sets the master logo only if it's still unset — never clobbers an
// existing baseline (e.g. one another event's onboarding already set, or a
// producer curated by hand in CRM Admin). Safe to call unconditionally;
// a no-op update when photo_url/logo_url is already non-null.
export async function setCrmCompanyLogoIfEmpty(companyId: string, logoUrl: string): Promise<void> {
  await supabaseAdmin.from('crm_companies').update({ logo_url: logoUrl }).eq('id', companyId).is('logo_url', null)
}

export async function upsertCrmContact(input: {
  email?: string | null
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  linkedinUrl?: string | null
  companyId?: string | null
  bio?: string | null
  photoUrl?: string | null
}): Promise<UpsertResult> {
  const email = input.email?.trim().toLowerCase() || null
  const { firstName, lastName } = input.firstName || input.lastName
    ? { firstName: input.firstName ?? null, lastName: input.lastName ?? null }
    : splitName(input.fullName ?? undefined)

  if (email) {
    const { data: existing } = await supabaseAdmin
      .from('crm_contacts')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (existing) return { id: existing.id, isNew: false }
  }

  const { data: created, error } = await supabaseAdmin
    .from('crm_contacts')
    .insert({
      email,
      first_name: firstName,
      last_name: lastName,
      linkedin_url: input.linkedinUrl ?? null,
      company_id: input.companyId ?? null,
      bio: input.bio ?? null,
      photo_url: input.photoUrl ?? null,
    })
    .select('id')
    .single()
  if (error?.code === '23505' && email) {
    const { data: winner } = await supabaseAdmin.from('crm_contacts').select('id').ilike('email', email).single()
    if (winner) return { id: winner.id, isNew: false }
  }
  if (error || !created) throw error ?? new Error('crm_contacts insert returned no row')
  return { id: created.id, isNew: true }
}

// Sets the master photo only if it's still unset — see
// setCrmCompanyLogoIfEmpty()'s comment, same reasoning.
export async function setCrmContactPhotoIfEmpty(contactId: string, photoUrl: string): Promise<void> {
  await supabaseAdmin.from('crm_contacts').update({ photo_url: photoUrl }).eq('id', contactId).is('photo_url', null)
}

// Persists every crm_property-mapped value found in a submission into the
// matching crm_contacts/crm_companies row's property_values — the step
// that was missing entirely until 2026-09-19: extractCrmPropertyValue()
// could read a mapped value back out of `submitted`, but nothing wrote it
// anywhere durable. Merges rather than replaces (jsonb `||`) so a partial
// submission never wipes properties a prior event's submission already
// set. Looks up which properties exist for this entityType from
// crm_properties itself rather than a hardcoded key list, so this
// automatically covers whatever fields get marked "sync with CRM" next —
// speaker-onboarding-specific today, other onboarding forms later.
export async function applyCrmPropertyValues(
  entityType: 'contact' | 'company', entityId: string, submitted: Record<string, SubmittedValue>,
): Promise<void> {
  const { data: properties } = await supabaseAdmin
    .from('crm_properties')
    .select('property_key')
    .eq('entity_type', entityType)
  if (!properties?.length) return

  const values: Record<string, string> = {}
  for (const { property_key } of properties) {
    const value = extractCrmPropertyValue(entityType, property_key, submitted)
    if (value) values[property_key] = value
  }
  if (Object.keys(values).length === 0) return

  const table = entityType === 'contact' ? 'crm_contacts' : 'crm_companies'
  const { data: row } = await supabaseAdmin.from(table).select('property_values').eq('id', entityId).single()
  await supabaseAdmin.from(table).update({ property_values: { ...(row?.property_values ?? {}), ...values } }).eq('id', entityId)
}

// Shared by the manual Add Speaker (POST) and edit (PATCH) routes — the
// same create-or-update-plus-property-sync a HubSpot submission gets via
// from-submission/route.ts, just entered by a staff member instead. Unlike
// that route, an existing CRM contact here gets its identity fields
// (email/name/linkedin) UPDATED, not just created-once — a producer fixing
// a typo'd email on the Details page should actually fix the CRM record
// too. bio is deliberately excluded from that update path: it's a
// once-seeded baseline (see upsertCrmContact's own comment) other events'
// submissions must never silently overwrite, and a producer's own event-
// scoped edit shouldn't either. Best-effort — never throws, so a CRM outage
// can't block saving the speaker record itself; returns the id to persist
// on the speaker row (unchanged from existingCrmContactId on failure).
export async function syncSpeakerCrmContact(
  eventId: string, existingCrmContactId: string | null, fields: Record<string, SubmittedValue>, schema: FieldSchema[], columns: Record<string, unknown>,
): Promise<string | null> {
  try {
    const email = extractEmailFromSubmission(schema, fields)
    const linkedinUrl = extractCrmPropertyValue('contact', 'linkedin_url', fields) ?? (typeof columns.linkedin_url === 'string' ? columns.linkedin_url : null)
    const firstName = typeof fields.first_name === 'string' ? fields.first_name : null
    const lastName = typeof fields.last_name === 'string' ? fields.last_name : null

    let crmContactId = existingCrmContactId
    if (crmContactId) {
      const patch: Record<string, string> = {}
      if (email) patch.email = email
      if (firstName) patch.first_name = firstName
      if (lastName) patch.last_name = lastName
      if (linkedinUrl) patch.linkedin_url = linkedinUrl
      if (Object.keys(patch).length > 0) await supabaseAdmin.from('crm_contacts').update(patch).eq('id', crmContactId)
    } else {
      const fullName = typeof columns.name === 'string' ? columns.name : null
      const bio = typeof columns.bio === 'string' ? columns.bio : null
      const result = await upsertCrmContact({ email, fullName, firstName, lastName, linkedinUrl, bio })
      crmContactId = result.id
    }
    await linkContactToEvent(crmContactId, eventId, 'speaker')
    await applyCrmPropertyValues('contact', crmContactId, fields)
    return crmContactId
  } catch (e) {
    console.error('CRM contact sync (manual speaker save) failed:', e)
    return existingCrmContactId
  }
}

export async function linkContactToEvent(contactId: string, eventId: string, role: string): Promise<void> {
  await supabaseAdmin.from('crm_contact_event_links').upsert(
    { contact_id: contactId, event_id: eventId, role },
    { onConflict: 'contact_id,event_id,role', ignoreDuplicates: true }
  )
}

export async function linkCompanyToEvent(companyId: string, eventId: string, role: string): Promise<void> {
  await supabaseAdmin.from('crm_company_event_links').upsert(
    { company_id: companyId, event_id: eventId, role },
    { onConflict: 'company_id,event_id,role', ignoreDuplicates: true }
  )
}
