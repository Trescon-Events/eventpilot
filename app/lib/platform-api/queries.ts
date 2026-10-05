import { getPublishedAgenda } from '@/app/lib/agenda/public'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventGuidelines, renderGuidelinesJson } from '@/app/lib/content/guidelines-api'
import type { TokenScope } from './auth'

/* Curated, read-only query layer for /api/public/v1/knowledge/* — every
   function here does an explicit field SELECT, never select('*'). This is
   deliberate, not just tidy: a raw row passthrough would leak internal
   column names (confirmation_status, producer_staff_id, konfhub_*,
   revenue_target, ...) to an external caller — the whole point of this
   file is that the shape of what comes back is hand-designed once here,
   not derived from the database's own shape.

   Speaker/partner field lists mirror the exact allowlist already proven
   safe on the live public website (app/api/public/event/[slug]/route.ts)
   — reusing a battle-tested "what's safe to show a stranger" list rather
   than re-deriving one. */

function eventFilter(scope: TokenScope) {
  return scope.eventScope === 'all' ? null : scope.eventIds
}

export async function listAccessibleEvents(scope: TokenScope) {
  let q = supabaseAdmin
    .from('events')
    .select('id, name, public_name, public_dates_display, public_venue_display, city, country, type, description, status, expected_attendance')
    .order('created_at', { ascending: false })
  const ids = eventFilter(scope)
  if (ids) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw new Error('query_failed')
  return (data ?? []).map(e => ({
    id: e.id,
    name: e.public_name || e.name,
    dates: e.public_dates_display,
    venue: e.public_venue_display,
    city: e.city,
    country: e.country,
    type: e.type,
    description: e.description,
    status: e.status,
    expected_attendance: e.expected_attendance,
  }))
}

export async function getEventOverview(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, name, public_name, public_dates_display, public_venue_display, city, country, type, description, status, expected_attendance, event_hashtag, registration_url, website_url')
    .eq('id', eventId)
    .single()
  if (error || !data) return null
  return {
    id: data.id,
    name: data.public_name || data.name,
    dates: data.public_dates_display,
    venue: data.public_venue_display,
    city: data.city,
    country: data.country,
    type: data.type,
    description: data.description,
    status: data.status,
    expected_attendance: data.expected_attendance,
    hashtag: data.event_hashtag,
    registration_url: data.registration_url,
    website_url: data.website_url,
  }
}

export async function getEventSpeakers(eventId: string) {
  // active + status='approved' — the exact same "safe to show externally"
  // bar the live public website already applies (app/api/public/event/
  // [slug]/route.ts) — a pending/unapproved speaker shouldn't appear here
  // either, same reasoning.
  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .select('id, public_name, name, role, company, bio, country, photo_url, linkedin_url, tier, session_title')
    .eq('event_id', eventId)
    .eq('active', true)
    .eq('status', 'approved')
  if (error) throw new Error('query_failed')
  return (data ?? []).map(s => ({
    id: s.id, name: s.public_name || s.name, role: s.role, company: s.company,
    bio: s.bio, country: s.country, photo_url: s.photo_url, linkedin_url: s.linkedin_url,
    tier: s.tier, session_title: s.session_title,
  }))
}

export async function getEventPartners(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .select('id, name, tier, logo_url, website_url, company_description')
    .eq('event_id', eventId)
    .eq('active', true)
  if (error) throw new Error('query_failed')
  return (data ?? []).map(p => ({ id: p.id, name: p.name, tier: p.tier, logo_url: p.logo_url, website_url: p.website_url, description: p.company_description }))
}

// Published Agenda Builder sessions (falls back to the legacy free-text agenda
// for events that haven't moved over) — see app/lib/agenda/public.ts.
export async function getEventAgenda(eventId: string) {
  try { return (await getPublishedAgenda(eventId)).items } catch { throw new Error('query_failed') }
}

// Explicit doc_type allowlist (2026-09-29, per Madhu — this token type is
// used internally by Trescon's own marketing/production teams, so
// bd_proposal is in scope alongside post_event_report). hr_policy is
// excluded by construction, not by a visibility flag: it's simply not in
// this list, and a new internal doc_type added later stays excluded by
// default (opt-in, not opt-out) unless someone deliberately adds it here.
const ALLOWED_DOC_TYPE_KEYS = ['post_event_report', 'bd_proposal']
const REFERENCE_DOC_ROLES = ['style_guide', 'messaging', 'production_pack'] as const

export async function getEventDocuments(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('docuhub_documents')
    .select('id, title, description, format, external_url, object_key, created_at, doc_types!inner(key, label)')
    .eq('event_id', eventId)
    .in('doc_types.key', ALLOWED_DOC_TYPE_KEYS)
    .eq('is_active', true)
    .is('deleted_at', null)
  if (error) throw new Error('query_failed')
  const files = (data ?? []).map(d => ({
    id: d.id, title: d.title, description: d.description,
    type: (d.doc_types as unknown as { label?: string } | null)?.label ?? null,
    url: d.external_url || d.object_key,
    created_at: d.created_at,
  }))

  // Reuses the Content Guidelines API's own compiler (app/lib/content/
  // guidelines-api.ts) rather than re-querying event_messaging_docs here —
  // it already merges an event's own live style guide/messaging/production
  // docs with whatever's inherited from its umbrella, exactly the "borrow
  // best practices from past events" shape this domain wants.
  const guidelines = await getEventGuidelines(eventId)
  const reference_docs = guidelines ? renderGuidelinesJson(guidelines, [...REFERENCE_DOC_ROLES]) : null

  return { files, reference_docs }
}

export async function searchDocuments(scope: TokenScope, q: string | null) {
  let query = supabaseAdmin
    .from('docuhub_documents')
    .select('id, title, description, format, external_url, object_key, event_id, event_label, created_at, doc_types!inner(key, label)')
    .in('doc_types.key', ALLOWED_DOC_TYPE_KEYS)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  const ids = eventFilter(scope)
  if (ids) query = query.in('event_id', ids)
  if (q) query = query.ilike('title', `%${q}%`)
  const { data, error } = await query
  if (error) throw new Error('query_failed')
  return (data ?? []).map(d => ({
    id: d.id, title: d.title, description: d.description,
    type: (d.doc_types as unknown as { label?: string } | null)?.label ?? null,
    event: d.event_label, url: d.external_url || d.object_key, created_at: d.created_at,
  }))
}

// kb_intel_items, auto_published only — see this session's own plan doc
// for why this table is what "news coverage"/"knowledge base" means here:
// Serper+Firecrawl+Gemini scanning the internet for real coverage of
// Trescon and its events, already scored/reviewed before publishing.
export async function searchIntel(q: string | null, eventName: string | null) {
  let query = supabaseAdmin
    .from('kb_intel_items')
    .select('id, url, title, published_date, gemini_summary, event_mentioned, article_type, discovered_at')
    .eq('status', 'auto_published')
    .order('discovered_at', { ascending: false })
    .limit(50)
  if (q) query = query.ilike('title', `%${q}%`)
  if (eventName) query = query.ilike('event_mentioned', `%${eventName}%`)
  const { data, error } = await query
  if (error) throw new Error('query_failed')
  return (data ?? []).map(i => ({
    id: i.id, url: i.url, title: i.title, published_date: i.published_date,
    summary: i.gemini_summary, event_mentioned: i.event_mentioned, type: i.article_type,
  }))
}
