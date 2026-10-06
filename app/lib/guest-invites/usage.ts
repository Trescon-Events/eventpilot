import { getKonfhubToken } from '@/app/lib/konfhub-speakers'

/*
  How many guests have registered with each speaker's code — read from KonfHub's
  attendee list (GET /event/:id/attendees), where every registration reports the
  `coupon_code` it used. KonfHub can't filter that list by code (a coupon_code
  query is rejected), so one check pages through ALL registrations of the KonfHub
  event (500 a page, a few pages at a time) and counts per code in a single pass.
  A confirmed registration is registration_status 2; status 3 (e.g. a pending
  "Registration Application") isn't counted as used. Results are cached briefly
  per KonfHub event so several checks in a row don't re-read thousands of rows.
*/

const PAGE = 500
const CONCURRENCY = 4
const CACHE_MS = 3 * 60 * 1000
const cache = new Map<string, { at: number; counts: Map<string, GuestRegistrant[]> }>()

export type GuestRegistrant = { name: string | null; email: string | null; registeredAt: string | null; ticket: string | null }

type Attendee = { coupon_code?: string | null; registration_status?: number; name?: string | null; email_id?: string | null; registered_at?: string | null; ticket_name?: string | null }

async function fetchPage(eventId: string, token: string, offset: number): Promise<{ rows: Attendee[]; total: number }> {
  const res = await fetch(`https://api.konfhub.com/event/${eventId}/attendees?limit=${PAGE}&offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`KonfHub attendees request failed (${res.status})`)
  const j = await res.json() as { participant_details?: Attendee[]; count?: number }
  return { rows: j.participant_details ?? [], total: j.count ?? 0 }
}

/** Confirmed registrations per (upper-cased) coupon code, for the whole KonfHub event. */
export async function fetchCodeRegistrations(konfhubEventId: string, clientId: string, clientSecret: string, opts: { fresh?: boolean } = {}): Promise<Map<string, GuestRegistrant[]>> {
  const hit = cache.get(konfhubEventId)
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return hit.counts

  const token = await getKonfhubToken(clientId, clientSecret)
  const first = await fetchPage(konfhubEventId, token, 0)
  const pages = [first.rows]
  const offsets: number[] = []
  for (let o = PAGE; o < first.total; o += PAGE) offsets.push(o)
  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = await Promise.all(offsets.slice(i, i + CONCURRENCY).map(o => fetchPage(konfhubEventId, token, o)))
    for (const b of batch) pages.push(b.rows)
  }

  const counts = new Map<string, GuestRegistrant[]>()
  for (const row of pages.flat()) {
    const code = (row.coupon_code ?? '').trim().toUpperCase()
    if (!code || row.registration_status !== 2) continue
    const list = counts.get(code) ?? []
    list.push({ name: row.name ?? null, email: row.email_id ?? null, registeredAt: row.registered_at ?? null, ticket: row.ticket_name ?? null })
    counts.set(code, list)
  }
  cache.set(konfhubEventId, { at: Date.now(), counts })
  return counts
}
