import * as XLSX from 'xlsx'
import { getKonfhubToken, fetchKonfhubTickets } from '@/app/lib/konfhub-speakers'
import { parseEventTime } from '@/app/lib/events/timezones'

/*
  What KonfHub itself says about a registration code — read, never written. KonfHub has no
  endpoint to look up one code, but GET /event/:id/coupons/download returns a link to an Excel
  export of EVERY code on the event (Code Name, Opens On, Expires On, Maximum Limit, Codes Used,
  Applicable Ticket(s)), in about a second. "Codes Used" is KonfHub's own counter — the one that
  enforces the limit and that its dashboard shows as 0/5 — so places available = limit - used.
  (It can run a place higher than the confirmed registrations in the attendee list, e.g. a pending
  application that still holds a place; KonfHub's number is the one that matters.)
  The export is cached for 20 seconds per KonfHub event so several lookups in a row share one read.
*/

export type CodeInfo = {
  code: string
  limit: number | null
  used: number
  available: number | null
  tickets: string[]            // applicable ticket names, e.g. "FIFF Conference - Guest Pass"
  opensAt: string | null       // ISO (event timezone applied)
  expiresAt: string | null
}

const CACHE_MS = 20 * 1000
const cache = new Map<string, { at: number; codes: Map<string, CodeInfo> }>()

// "04:59 PM, 06 November 2026" (event-local) -> ISO
function parseCodeTime(s: unknown, tz: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM),\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i.exec(String(s ?? '').trim())
  if (!m) return null
  let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(m[5].toLowerCase())
  if (month < 0) return null
  const local = `${m[6]}-${String(month + 1).padStart(2, '0')}-${m[4].padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[2]}`
  return parseEventTime(local, tz)?.toISOString() ?? null
}

export async function fetchKonfhubCodes(konfhubEventId: string, clientId: string, clientSecret: string, tz: string, opts: { fresh?: boolean } = {}): Promise<Map<string, CodeInfo>> {
  const hit = cache.get(konfhubEventId)
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return hit.codes

  const token = await getKonfhubToken(clientId, clientSecret)
  const res = await fetch(`https://api.konfhub.com/event/${konfhubEventId}/coupons/download`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`KonfHub code export failed (${res.status})`)
  const { download_url } = await res.json() as { download_url?: string }
  if (!download_url) throw new Error('KonfHub did not return the code export.')
  const file = await fetch(download_url)
  if (!file.ok) throw new Error(`Could not download KonfHub’s code export (${file.status})`)
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()))
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })

  const codes = new Map<string, CodeInfo>()
  for (const r of rows) {
    const code = String(r['Code Name'] ?? '').trim().toUpperCase()
    if (!code) continue
    const limit = r['Maximum Limit'] === '' ? null : Number(r['Maximum Limit'])
    const used = Number(r['Codes Used'] ?? 0) || 0
    codes.set(code, {
      code, limit: Number.isFinite(limit as number) ? limit : null, used,
      available: Number.isFinite(limit as number) ? Math.max((limit as number) - used, 0) : null,
      tickets: String(r['Applicable Ticket(s)'] ?? '').split(/\s*,\s*(?=[A-Z])/).map(t => t.trim()).filter(Boolean),
      opensAt: parseCodeTime(r['Opens On'], tz), expiresAt: parseCodeTime(r['Expires On'], tz),
    })
  }
  cache.set(konfhubEventId, { at: Date.now(), codes })
  return codes
}

/** Ticket ids inside a checkout link's ticketId=77824%7C1%3B parameter (id|quantity;…). */
export function ticketIdsInLink(url: string): number[] {
  const raw = new URL(url).searchParams.get('ticketId') ?? ''
  return raw.split(';').map(p => Number(p.split('|')[0])).filter(n => Number.isInteger(n) && n > 0)
}

export type CodeCheck = {
  found: boolean
  info: CodeInfo | null
  warnings: string[]
}

/** Looks the code up and cross-checks it against the link (right pass? open? expired? places left?). */
export async function checkGuestCode(args: { konfhubEventId: string; clientId: string; clientSecret: string; tz: string; code: string; url: string; fresh?: boolean }): Promise<CodeCheck> {
  const codes = await fetchKonfhubCodes(args.konfhubEventId, args.clientId, args.clientSecret, args.tz, { fresh: args.fresh })
  const info = codes.get(args.code.toUpperCase()) ?? null
  if (!info) return { found: false, info: null, warnings: [`The code ${args.code} wasn’t found on KonfHub — check the link, or ask the delegate team whether it has been created yet.`] }

  const warnings: string[] = []
  try {
    const linkTickets = ticketIdsInLink(args.url)
    if (linkTickets.length) {
      const token = await getKonfhubToken(args.clientId, args.clientSecret)
      const names = (await fetchKonfhubTickets(args.konfhubEventId, token)).flatMap(c => c.tickets).filter(t => linkTickets.includes(t.ticket_id)).map(t => t.ticket_name)
      if (names.length && info.tickets.length && !names.some(n => info.tickets.includes(n))) warnings.push(`The link is for “${names.join(', ')}” but this code applies to “${info.tickets.join(', ')}”.`)
    }
  } catch { /* ticket cross-check is best-effort */ }
  const now = Date.now()
  if (info.expiresAt && new Date(info.expiresAt).getTime() < now) warnings.push('This code has expired on KonfHub.')
  else if (info.opensAt && new Date(info.opensAt).getTime() > now) warnings.push('This code isn’t open yet on KonfHub.')
  if (info.limit === null) warnings.push('This code has no limit set on KonfHub.')
  else if (info.available === 0) warnings.push('All of this code’s places are already used.')
  return { found: true, info, warnings }
}
