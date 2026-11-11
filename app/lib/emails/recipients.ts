/* Emails module, phase 1 (2026-11-11) — who a list contains and who it will actually reach. Pure: no database, no clock, so every rule is tested.
   Spec: docs/build_suggestions/emails-module.md. A PERSON is a CRM contact (deduplicated by email); one person can have a record at several events. */

export type PoolRecord = {
  speaker_id: string
  event_id: string
  event_name: string
  event_end: string | null            // real event end day (event days), null when none yet
  contact_id: string | null           // CRM person; null = a record with no CRM link (treated as its own person)
  name: string
  public_name: string | null
  company: string | null
  country: string | null
  status: string | null               // confirmation_status; null = no status yet
  planned_roles: string[]
  producer_id: string | null
  producer_name: string | null
  own_email: string | null            // email on the speaker record itself
  contact_email: string | null        // email on the CRM contact
  additional: { email: string; name: string | null }[]
  updated_at: string | null
  archived: boolean                   // soft-deleted
  delete_reason: string | null
}
export type ContactFlags = { do_not_email: boolean; dne_reason: string | null; email_status: 'ok' | 'bounced' | 'invalid' | 'review' }

export type ListFilters = {
  event_ids?: string[]
  statuses?: string[]                 // 'none' = no status yet
  match?: 'any' | 'all'               // with several events: spoke at any of them, or at all of them
  roles?: string[]
  countries?: string[]
  producer_ids?: string[]
  not_on_event_ids?: string[]         // leave out anyone who has a record at these events (invite past speakers to a new event)
  last_event_before_months?: number   // only people whose latest matching event ended more than N months ago
}

export type Person = {
  key: string
  contact_id: string | null
  name: string
  company: string | null
  country: string | null
  records: PoolRecord[]               // the records that matched the filters
  rep: PoolRecord                     // the record that supplies name, company and address
  statuses: { event_name: string; status: string | null }[]
  last_event_end: string | null
  company_changed: { from: string; to: string } | null
}

export type Recipient = Person & { to: string; cc: string[]; mode: 'own' | 'assistant' }
export type Excluded = { person: Person; reason: string }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
export const cleanEmail = (s: string | null | undefined): string | null => { const t = (s ?? '').trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null }
const CONFIRMED = new Set(['Confirmed', 'New Confirmed', 'Reconfirmed', 'Spoke'])

/** A record counts unless it was deleted as a test, duplicate or mistake. A soft-deleted record still counts when its status says the speaker withdrew. */
export function countable(r: PoolRecord): boolean {
  if (r.delete_reason) return false
  if (r.archived && r.status !== 'Withdrew') return false
  return true
}

function monthsBetween(fromIso: string, now: Date): number {
  const d = new Date(`${fromIso}T00:00:00Z`)
  return (now.getFullYear() - d.getUTCFullYear()) * 12 + (now.getMonth() - d.getUTCMonth()) - (now.getDate() < d.getUTCDate() ? 1 : 0)
}

/** Records → people, applying the filters. */
export function buildPeople(pool: PoolRecord[], f: ListFilters, now: Date): Person[] {
  const live = pool.filter(countable)
  const sameEmail = new Map<string, string>() // address → person key, so a record with no CRM link joins the person who has that address
  const keyOf = (r: PoolRecord) => {
    if (r.contact_id) return `c:${r.contact_id}`
    const e = norm(cleanEmail(r.own_email))
    if (e) return sameEmail.get(e) ?? (sameEmail.set(e, `e:${e}`), `e:${e}`)
    return `s:${r.speaker_id}`
  }
  const byKey = new Map<string, PoolRecord[]>()
  for (const r of live) { const k = keyOf(r); (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r) }

  const events = new Set(f.event_ids ?? [])
  const statuses = new Set(f.statuses ?? [])
  const roles = new Set((f.roles ?? []).map(norm))
  const countries = new Set((f.countries ?? []).map(norm))
  const producers = new Set(f.producer_ids ?? [])
  const recordMatches = (r: PoolRecord) =>
    (!events.size || events.has(r.event_id)) &&
    (!statuses.size || statuses.has(r.status ?? 'none')) &&
    (!roles.size || r.planned_roles.some(x => roles.has(norm(x)))) &&
    (!countries.size || countries.has(norm(r.country))) &&
    (!producers.size || (!!r.producer_id && producers.has(r.producer_id)))

  const out: Person[] = []
  for (const [key, all] of byKey) {
    if ((f.not_on_event_ids ?? []).some(id => all.some(r => r.event_id === id))) continue
    const matched = all.filter(recordMatches)
    if (!matched.length) continue
    if (f.match === 'all' && events.size > 1 && ![...events].every(id => matched.some(r => r.event_id === id))) continue

    const rank = (r: PoolRecord) => (CONFIRMED.has(r.status ?? '') ? 1 : 0)
    const sorted = [...matched].sort((a, b) => rank(b) - rank(a) || (b.event_end ?? '').localeCompare(a.event_end ?? '') || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    const rep = sorted[0]
    const ends = matched.map(r => r.event_end).filter((x): x is string => !!x).sort()
    const lastEnd = ends.length ? ends[ends.length - 1] : null
    if (f.last_event_before_months && (!lastEnd || monthsBetween(lastEnd, now) < f.last_event_before_months)) continue

    // "Moved from X to Y": the company on the person's latest event differs from the one on the event before it.
    const byEnd = [...all].sort((a, b) => (b.event_end ?? '').localeCompare(a.event_end ?? '') || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    const latest = byEnd[0]; const prev = byEnd.find(r => r.event_id !== latest.event_id && norm(r.company))
    const changed = latest && prev && norm(latest.company) && norm(latest.company) !== norm(prev.company) ? { from: prev.company!.trim(), to: latest.company!.trim() } : null

    out.push({
      key, contact_id: rep.contact_id, name: rep.public_name?.trim() || rep.name, company: rep.company, country: rep.country,
      records: matched, rep, statuses: matched.map(r => ({ event_name: r.event_name, status: r.status })), last_event_end: lastEnd, company_changed: changed,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** People → who gets the email and who is left out, each with the reason. Order of rules: do not email, bad address, no address, shared address. */
export function resolveRecipients(
  people: Person[], flags: Map<string, ContactFlags>, opts: { allowAssistant?: boolean; pinned?: string[]; excluded?: string[] } = {},
): { recipients: Recipient[]; excluded: Excluded[] } {
  const removed = new Set(opts.excluded ?? [])
  const recipients: Recipient[] = []; const excluded: Excluded[] = []
  const takenBy = new Map<string, string>()
  for (const p of people) {
    if (p.contact_id && removed.has(p.contact_id)) { excluded.push({ person: p, reason: 'Removed from this list by hand' }); continue }
    const fl = p.contact_id ? flags.get(p.contact_id) : undefined
    if (fl?.do_not_email) { excluded.push({ person: p, reason: `Do not email${fl.dne_reason ? ` (${fl.dne_reason.replace(/_/g, ' ')})` : ''}` }); continue }
    if (fl && (fl.email_status === 'bounced' || fl.email_status === 'invalid')) { excluded.push({ person: p, reason: fl.email_status === 'bounced' ? 'Email bounced before' : 'Email address marked invalid' }); continue }

    const own = [p.rep.own_email, p.rep.contact_email, ...p.records.flatMap(r => [r.own_email, r.contact_email])].map(cleanEmail).find(Boolean) ?? null
    const extras = [...new Map(p.records.flatMap(r => r.additional).map(a => [norm(cleanEmail(a.email)), cleanEmail(a.email)] as const).filter(([k]) => k)).values()] as string[]
    let to: string | null = null; let cc: string[] = []; let mode: 'own' | 'assistant' = 'own'
    if (own) { to = own; cc = extras.filter(e => norm(e) !== norm(own)) }
    else if (extras.length && opts.allowAssistant) { to = extras[0]; cc = extras.slice(1); mode = 'assistant' }
    else { excluded.push({ person: p, reason: extras.length ? 'Only reachable through an assistant or office contact (not allowed for this email)' : 'No email address' }); continue }

    const prior = takenBy.get(norm(to))
    if (prior) { excluded.push({ person: p, reason: `Same address as ${prior}` }); continue }
    takenBy.set(norm(to), p.name)
    recipients.push({ ...p, to, cc, mode })
  }
  return { recipients, excluded }
}

/** Counts shown above a preview. */
export function summarize(recipients: Recipient[], excluded: Excluded[]) {
  const reasons: Record<string, number> = {}
  for (const e of excluded) { const k = e.reason.replace(/\s*\(.*\)$/, '').replace(/^Same address as .*/, 'Same address as another person'); reasons[k] = (reasons[k] ?? 0) + 1 }
  return { will_receive: recipients.length, excluded: excluded.length, reasons, via_assistant: recipients.filter(r => r.mode === 'assistant').length, company_changed: recipients.filter(r => r.company_changed).length }
}
