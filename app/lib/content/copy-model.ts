import { createHash } from 'node:crypto'
import { contentText, changedPhrases } from './edit-diff'

/* Copy Library pure logic (docs/build_suggestions/copy-library.md §3, §5, §6). No database, no model, no clock: tested on its own. */

export type ItemStatus = 'draft' | 'in_internal_review' | 'pending_client' | 'approved' | 'needs_review' | 'edited_since_approval'
/** doc_id/section_id/section_hash as specified; section_title and section_text are extra so a section can be found again after its document is replaced by a new
    live version (new doc id), and so the review reason can show the exact words that changed. */
export type SourceRef = { doc_id: string; section_id: string; section_hash: string; section_title?: string; section_text?: string }
export type OwnerLevel = 'event' | 'umbrella' | 'org'

/** A stable fingerprint of a section's content (whitespace-insensitive), so a re-save that changes nothing is not a change. */
export function sectionHash(content: unknown): string {
  const text = contentText(content).replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** Most specific wins: event, then umbrella, then org. `items` carry their level; returns the winning one for the wanted key/length/phase. */
export function pickItem<T extends { level: OwnerLevel; asset_key: string; variant_length: string; variant_phase: string; approved_text: string | null }>(
  items: T[], assetKey: string, opts: { length?: string; phase: 'pre' | 'post' },
): T | null {
  const order: OwnerLevel[] = ['event', 'umbrella', 'org']
  const lengthOf = (it: T) => (opts.length ? it.variant_length === opts.length : true)
  for (const level of order) {
    for (const phase of [opts.phase, 'any']) {
      const hit = items.find(it => it.level === level && it.asset_key === assetKey && lengthOf(it) && it.variant_phase === phase && !!it.approved_text?.trim())
      if (hit) return hit
    }
  }
  return null
}

export type SectionSnapshot = { doc_id: string; section_id: string; content: unknown } | null
export type ReviewFinding = { changed: boolean; reason: string | null; pairs: Array<{ removed: string; added: string }> }

/** Compare what an item was built from with the sections as they are now. `previous` text is carried only when the caller has it
    (the reason prefers phrases that actually occur in the item's own text). */
export function reviewFinding(refs: SourceRef[], current: SectionSnapshot[], itemText: string): ReviewFinding {
  const pairs: Array<{ removed: string; added: string }> = []
  const gone: string[] = []
  let changed = false
  refs.forEach((ref, i) => {
    const now = current[i]
    if (!now) { changed = true; gone.push(ref.section_id); return }
    if (sectionHash(now.content) === ref.section_hash) return
    changed = true
    const old = ref.section_text
    if (old) pairs.push(...changedPhrases(old, contentText(now.content)))
  })
  if (!changed) return { changed: false, reason: null, pairs: [] }
  const inText = pairs.filter(p => itemText.toLowerCase().includes(p.removed.toLowerCase()))
  const use = inText.length ? inText : pairs
  const reason = use.length
    ? use.slice(0, 3).map(p => (p.added ? `'${p.removed}' → '${p.added}'` : `'${p.removed}' removed`)).join('; ')
    : gone.length ? 'A section this was built from was removed from the document.' : 'A section this was built from changed in the messaging document.'
  return { changed: true, reason, pairs: use }
}

/** "Apply this change": the same replacement on the working text, whole word occurrences, case as written. Returns null when nothing in the text matched. */
export function applyPairs(text: string, pairs: Array<{ removed: string; added: string }>): string | null {
  let out = text
  for (const p of pairs) {
    if (!p.removed) continue
    out = out.split(p.removed).join(p.added)
  }
  return out === text ? null : out
}

/** The status an edit leaves an item in. Editing an approved item keeps tools on approved_text. */
export function statusAfterEdit(status: ItemStatus, hasApproved: boolean): ItemStatus {
  if (status === 'approved' || status === 'edited_since_approval') return 'edited_since_approval'
  if (status === 'needs_review') return 'needs_review'
  return hasApproved ? 'edited_since_approval' : 'draft'
}

/** Is client approval required for this event? Stored value wins; otherwise managed events only. */
export function clientApprovalRequired(stored: boolean | null | undefined, eventType: string | null | undefined): boolean {
  return typeof stored === 'boolean' ? stored : eventType === 'managed'
}

/** CTA overlay (§6.1): the library text is the label; the event's registration URL is appended by the existing line builder, so a trailing copy of that
    URL inside the approved text is removed first. */
export function ctaLabelFromLibrary(text: string, registrationUrl: string | null | undefined): string {
  let t = text.trim()
  const url = registrationUrl?.trim()
  if (url && t.endsWith(url)) t = t.slice(0, -url.length).trim()
  return t
}

/** Suggestion only (the producer flips the switch): does the free-text public date look like it is in the past? */
export function datesLookPast(display: string | null): boolean {
  if (!display) return false
  const years = [...display.matchAll(/\b(20\d\d)\b/g)].map(m => Number(m[1]))
  if (!years.length) return false
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const year = Math.max(...years)
  const lower = display.toLowerCase()
  const mi = MONTHS.map((m, i) => (lower.includes(m) || lower.includes(m.slice(0, 3) + ' ') ? i : -1)).filter(i => i >= 0)
  const month = mi.length ? Math.max(...mi) : 11
  const day = Math.max(...[...display.matchAll(/\b(\d{1,2})\b/g)].map(m => Number(m[1])).filter(n => n >= 1 && n <= 31), 1)
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59))
  return end.getTime() < Date.now()
}
