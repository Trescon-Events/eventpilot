import { supabaseAdmin } from '@/app/lib/supabase'
import { strictEventDays } from '@/app/lib/events/event-days'
import type { PoolRecord, ContactFlags } from './recipients'

/* Emails module, phase 1 — loads the speaker pool from the database: each event's own speaker records joined to the CRM person, their additional
   contacts and their producer. Nothing is copied or stored: this is a view, read fresh every time. Which events are visible is decided by the caller
   (a producer only sees people through events they have access to). */

export type PoolData = {
  pool: PoolRecord[]
  flags: Map<string, ContactFlags>
  events: { id: string; name: string; start: string | null; end: string | null }[]
  producers: { id: string; name: string }[]
  roles: string[]
  countries: string[]
}

async function inChunks<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))))
  return out
}

/** `eventIds` = the events whose speakers may be used; null means every event (platform admin). */
export async function loadPool(eventIds: string[] | null): Promise<PoolData> {
  const evQuery = supabaseAdmin.from('events').select('id, name, actual_start_date, actual_end_date')
  const { data: evRows } = eventIds ? await evQuery.in('id', eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000']) : await evQuery
  const events = (evRows ?? []).map(e => { const d = strictEventDays(e as { actual_start_date: string | null; actual_end_date: string | null }); return { id: e.id as string, name: e.name as string, start: d.start, end: d.end } })
  const eventById = new Map(events.map(e => [e.id, e]))
  if (!events.length) return { pool: [], flags: new Map(), events, producers: [], roles: [], countries: [] }

  const cols = 'id, event_id, name, public_name, company, country, confirmation_status, planned_roles, producer_staff_id, email, crm_contact_id, updated_at, announcement_status, delete_reason'
  const speakers: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from('event_speakers').select(cols).in('event_id', events.map(e => e.id)).order('id').range(from, from + 999)
    speakers.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  const contactIds = [...new Set(speakers.map(s => s.crm_contact_id as string | null).filter((x): x is string => !!x))]
  const contacts = await inChunks(contactIds, 200, async ids => (await supabaseAdmin.from('crm_contacts').select('id, email, do_not_email, dne_reason, email_status').in('id', ids)).data ?? [])
  const contactById = new Map(contacts.map(c => [c.id as string, c]))
  const flags = new Map<string, ContactFlags>(contacts.map(c => [c.id as string, { do_not_email: !!c.do_not_email, dne_reason: (c.dne_reason as string | null) ?? null, email_status: ((c.email_status as ContactFlags['email_status']) ?? 'ok') }]))

  const speakerIds = speakers.map(s => s.id as string)
  const extras = await inChunks(speakerIds, 200, async ids => (await supabaseAdmin.from('speaker_additional_contacts').select('speaker_id, email, first_name, last_name').in('speaker_id', ids)).data ?? [])
  const extrasBy = new Map<string, { email: string; name: string | null }[]>()
  for (const x of extras) { if (!x.email) continue; const list = extrasBy.get(x.speaker_id as string) ?? []; list.push({ email: x.email as string, name: [x.first_name, x.last_name].filter(Boolean).join(' ') || null }); extrasBy.set(x.speaker_id as string, list) }

  const producerIds = [...new Set(speakers.map(s => s.producer_staff_id as string | null).filter((x): x is string => !!x))]
  const staff = await inChunks(producerIds, 200, async ids => (await supabaseAdmin.from('staff_members').select('id, name').in('id', ids)).data ?? [])
  const staffName = new Map(staff.map(s => [s.id as string, s.name as string]))

  const pool: PoolRecord[] = speakers.map(s => {
    const ev = eventById.get(s.event_id as string)!
    const c = s.crm_contact_id ? contactById.get(s.crm_contact_id as string) : undefined
    return {
      speaker_id: s.id as string, event_id: s.event_id as string, event_name: ev?.name ?? '', event_end: ev?.end ?? null,
      contact_id: (s.crm_contact_id as string | null) ?? null, name: (s.name as string) ?? '', public_name: (s.public_name as string | null) ?? null,
      company: (s.company as string | null) ?? null, country: (s.country as string | null) ?? null, status: (s.confirmation_status as string | null) ?? null,
      planned_roles: (s.planned_roles as string[] | null) ?? [], producer_id: (s.producer_staff_id as string | null) ?? null, producer_name: s.producer_staff_id ? staffName.get(s.producer_staff_id as string) ?? null : null,
      own_email: (s.email as string | null) ?? null, contact_email: (c?.email as string | null) ?? null, additional: extrasBy.get(s.id as string) ?? [],
      updated_at: (s.updated_at as string | null) ?? null, archived: s.announcement_status === 'archived', delete_reason: (s.delete_reason as string | null) ?? null,
    }
  })

  return {
    pool, flags, events: events.sort((a, b) => a.name.localeCompare(b.name)),
    producers: [...staffName].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    roles: [...new Set(pool.flatMap(r => r.planned_roles))].sort(),
    countries: [...new Set(pool.map(r => r.country?.trim()).filter((x): x is string => !!x))].sort(),
  }
}
