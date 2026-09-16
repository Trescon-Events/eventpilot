// CRM layer — Phase 1 upsert helpers, shared by both onboarding
// from-submission routes (speakers, partners). Dedup approach mirrors
// SmartData's proven sd_contact_records/sd_company_records pattern (unique
// lower(email) / lower(domain)) rather than inventing a new one — see
// supabase/crm_objects_migration.sql for the actual unique indexes.
//
// Forward-only: this module is only ever called from the two onboarding
// routes on NEW submissions. It never runs against existing event_speakers/
// event_sponsors rows — no backfill.

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

export async function upsertCrmCompany(input: { name: string; website?: string | null; domain?: string | null }): Promise<string> {
  const domain = input.domain ?? extractDomain(input.website)

  if (domain) {
    const { data: existing } = await supabaseAdmin
      .from('crm_companies')
      .select('id')
      .ilike('domain', domain)
      .maybeSingle()
    if (existing) return existing.id
  }

  const { data: created, error } = await supabaseAdmin
    .from('crm_companies')
    .insert({ name: input.name, website: input.website ?? null, domain })
    .select('id')
    .single()
  // A concurrent submission for the same domain can race this check-then-
  // insert — the unique index catches it; fall back to the row it kept.
  if (error?.code === '23505' && domain) {
    const { data: winner } = await supabaseAdmin.from('crm_companies').select('id').ilike('domain', domain).single()
    if (winner) return winner.id
  }
  if (error || !created) throw error ?? new Error('crm_companies insert returned no row')
  return created.id
}

export async function upsertCrmContact(input: {
  email?: string | null
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  linkedinUrl?: string | null
  companyId?: string | null
}): Promise<string> {
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
    if (existing) return existing.id
  }

  const { data: created, error } = await supabaseAdmin
    .from('crm_contacts')
    .insert({
      email,
      first_name: firstName,
      last_name: lastName,
      linkedin_url: input.linkedinUrl ?? null,
      company_id: input.companyId ?? null,
    })
    .select('id')
    .single()
  if (error?.code === '23505' && email) {
    const { data: winner } = await supabaseAdmin.from('crm_contacts').select('id').ilike('email', email).single()
    if (winner) return winner.id
  }
  if (error || !created) throw error ?? new Error('crm_contacts insert returned no row')
  return created.id
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
