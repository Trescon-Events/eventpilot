import { isDirty, CLEAN_EVENT_FIELDS } from '@/app/lib/text/clean-field'

/* SAE readiness check (docs/build_suggestions/sae-readiness-and-setup-approval.md, Part 2). Pure — no DB, no clock — so it can be
   unit-tested and reused by the generate gate, the Setup tab and the grandfathering check. 'block' stops generation; 'warn' is shown
   but never stops it. */
export type CheckLevel = 'block' | 'warn'
export type ReadinessCheck = { key: string; level: CheckLevel; message: string; fix_href: string }

export type ReadinessEvent = {
  id: string
  name: string | null
  public_name: string | null
  public_dates_display: string | null
  public_venue_display: string | null
  event_hashtag: string | null
  registration_url: string | null
  announcement_cta_label: string | null
  announcement_attribution_line: string | null
  sae_copy_mode: string | null
  umbrella_id: string | null
  sae_compile_error?: string | null
}
export type ReadinessDoc = { id: string; role: string; status: string; extraction_status?: string | null }
export type ReadinessInput = {
  event: ReadinessEvent
  /** Every reference document of the event and of its umbrella (any status). */
  docs: ReadinessDoc[]
  compiled: { version: number; conflicts: unknown[] | null } | null
}

const blank = (v: string | null | undefined) => !v || !v.trim()
const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** -isation/-ization spelling variants compare equal. */
const spellingKey = (w: string) => w.replace(/isation/g, 'ization').replace(/ise\b/g, 'ize')
const nameWords = (s: string) => s.toLowerCase().replace(/\b(19|20)\d\d\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean).map(spellingKey)

export function runReadiness({ event, docs, compiled }: ReadinessInput): ReadinessCheck[] {
  const out: ReadinessCheck[] = []
  const details = `/admin/events/${event.id}/details`
  const refDocs = `${details}?tab=messaging`
  const add = (key: string, level: CheckLevel, message: string, fix_href = details) => out.push({ key, level, message, fix_href })

  // ── blocking ──
  if (blank(event.public_name)) add('public_name', 'block', 'Public event name is not set.')
  if (blank(event.public_dates_display)) add('dates', 'block', 'Public dates are not set.')
  if (blank(event.public_venue_display)) add('venue', 'block', 'Public venue is not set.')
  if (blank(event.event_hashtag)) add('hashtag', 'block', 'Event hashtag is not set.')
  else if (!/^#[A-Za-z0-9]+$/.test(event.event_hashtag!)) add('hashtag', 'block', `Event hashtag "${event.event_hashtag}" must start with # and contain only letters and digits.`)
  const ctaProblems: string[] = []
  if (blank(event.registration_url)) ctaProblems.push('the registration URL is not set')
  else if (!/^https:\/\/\S+$/.test(event.registration_url!.trim())) ctaProblems.push('the registration URL must start with https://')
  // The label drives the fixed CTA line, which only exists in assembled mode; legacy events (DFS) keep the model-written CTA and need no label.
  if (event.sae_copy_mode === 'assembled' && blank(event.announcement_cta_label)) ctaProblems.push('the call-to-action label is not set')
  if (ctaProblems.length) add('cta', 'block', `Call to action: ${ctaProblems.join(' and ')}.`)
  const liveMessaging = docs.some(d => d.role === 'messaging' && d.status === 'live')
  if (!liveMessaging) add('messaging_doc', 'block', 'No live messaging document (event or umbrella).', refDocs)
  else if (!compiled) add('messaging_doc', 'block', 'The reference has not been compiled yet — approve or re-approve a document to compile it.', refDocs)
  const dirty = CLEAN_EVENT_FIELDS.filter(f => isDirty((event as unknown as Record<string, string | null>)[f]))
  if (dirty.length) add('clean_text', 'block', `Hidden characters or stray spaces in: ${dirty.join(', ')}. Re-save them on Event Details to clean them.`)

  // ── warnings ──
  if (event.event_hashtag && event.public_name && /^#[A-Za-z0-9]+$/.test(event.event_hashtag)) {
    const h = event.event_hashtag.toLowerCase().replace(/[#0-9]/g, '')
    const n = lettersOnly(event.public_name.replace(/\b(19|20)\d\d\b/g, ''))
    if (h && n && h !== n && !n.startsWith(h) && !h.startsWith(n)) add('hashtag_vs_name', 'warn', `The hashtag ${event.event_hashtag} doesn't match the public name "${event.public_name}" — check for a lookalike letter (a lower-case l for a capital I).`)
  }
  if (event.public_name && event.name) {
    const a = new Set(nameWords(event.public_name)); const b = new Set(nameWords(event.name))
    const diff = [...a].filter(w => !b.has(w)).concat([...b].filter(w => !a.has(w)))
    if (diff.length) add('public_vs_internal_name', 'warn', `Public name "${event.public_name}" and event name "${event.name}" differ (${[...new Set(diff)].join(', ')}).`)
  }
  if (event.sae_copy_mode !== 'assembled') add('copy_mode', 'warn', 'Copy mode is legacy — fixed lines (dates, venue, hashtags, attribution) are not code-assembled.')
  if (event.umbrella_id && blank(event.announcement_attribution_line)) add('attribution', 'warn', 'No attribution line is set for this umbrella event.')
  const pending = docs.filter(d => d.status === 'draft' || d.extraction_status === 'processing')
  if (pending.length) add('pending_drafts', 'warn', `${pending.length} reference document${pending.length === 1 ? ' is' : 's are'} still in draft or extracting.`, refDocs)
  if (event.sae_compile_error) add('compile_failed', 'warn', `The last reference recompile failed: ${event.sae_compile_error}`, refDocs)
  const conflicts = compiled?.conflicts?.length ?? 0
  if (conflicts > 0) add('conflicts', 'warn', `${conflicts} unresolved conflict${conflicts === 1 ? '' : 's'} in the compiled reference.`, refDocs)

  return out
}

export const blockingChecks = (checks: ReadinessCheck[]) => checks.filter(c => c.level === 'block')

/* Per-speaker warnings, shown on the generate screen — never blocking. */
export type SpeakerForReadiness = { id: string; name?: string | null; public_name?: string | null; role?: string | null; company?: string | null; bio?: string | null; pronoun_style?: string | null }
export function speakerWarnings(s: SpeakerForReadiness): string[] {
  const w: string[] = []
  if (blank(s.role)) w.push('missing job title')
  if (blank(s.company)) w.push('missing company')
  else if (/[–—]/.test(s.company!)) w.push('company contains an en/em dash (breaks the KonfHub push)')
  if ((s.bio ?? '').length > 500) w.push(`short bio is ${(s.bio ?? '').length} characters (over 500)`)
  if (blank(s.public_name)) w.push('missing public name')
  if (blank(s.pronoun_style)) w.push('missing pronoun style')
  return w
}
