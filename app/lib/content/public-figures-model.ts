import { changedPhrases } from './edit-diff'
import type { FigureKind } from './public-figures-catalogue'

/* Public figures pure logic (docs/build_suggestions/public-figures.md §4, §6). No database, no model, no clock: tested on its own. */

export type FigureStatus = 'draft' | 'in_internal_review' | 'pending_client' | 'client_suggested' | 'client_rejected' | 'approved' | 'edited_since_approval'
export type BreakdownRow = { label: string; display: string; percent?: number }
export type FigurePayload = { display?: string; title?: string; rows?: BreakdownRow[]; text?: string }
export type Pair = { removed: string; added: string }

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** The percentage a display string carries ("20%", "12.5 %"), or null. */
export function percentOf(display: string): number | null {
  const m = display.match(/(-?\d+(?:\.\d+)?)\s*%/)
  return m ? Number(m[1]) : null
}

/** Cleans a payload to the shape of its kind. Unknown keys are dropped; a breakdown row gets its percent from the display when it ends in %. */
export function normalizePayload(kind: FigureKind, raw: unknown): FigurePayload {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (kind === 'figure') return { display: str(r.display, 80) }
  if (kind === 'outcome') return { text: typeof r.text === 'string' ? r.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200) : '' }
  const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, 40).map(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const display = str(o.display, 40)
    const given = typeof o.percent === 'number' && Number.isFinite(o.percent) ? o.percent : null
    const percent = given ?? percentOf(display)
    return { label: str(o.label, 80), display, ...(percent !== null ? { percent } : {}) }
  }).filter(x => x.label || x.display)
  return { title: str(r.title, 120), rows }
}

/** Has the producer filled this item in? An empty template entry is not "filled" and cannot be sent for review. */
export function isFilled(kind: FigureKind, p: FigurePayload): boolean {
  if (kind === 'figure') return !!p.display?.trim()
  if (kind === 'outcome') return !!p.text?.trim()
  return (p.rows ?? []).some(r => r.label.trim() && r.display.trim())
}

/** A breakdown whose percentages do not add up to 100 (warn, never block). Null when it adds up, or when it is not a percentage breakdown. */
export function breakdownSumWarning(p: FigurePayload): string | null {
  const rows = (p.rows ?? []).filter(r => typeof r.percent === 'number')
  if (rows.length < 2 || rows.length < (p.rows ?? []).length) return null
  const sum = rows.reduce((t, r) => t + (r.percent as number), 0)
  return Math.abs(sum - 100) > 0.5 ? `The percentages add up to ${Math.round(sum * 10) / 10}%, not 100%.` : null
}

/** Every piece of wording that a person will read: run these through the event's rules. */
export function textsToCheck(kind: FigureKind, label: string, p: FigurePayload): string[] {
  const out = [label]
  if (kind === 'figure') out.push(p.display ?? '')
  else if (kind === 'outcome') out.push(p.text ?? '')
  else { out.push(p.title ?? ''); for (const r of p.rows ?? []) out.push(r.label, r.display) }
  return out.filter(t => t.trim())
}

/** Same label, same words? Used to see that a producer accepted the client's suggestion exactly. */
export function samePayload(kind: FigureKind, a: FigurePayload, b: FigurePayload): boolean {
  return JSON.stringify(normalizePayload(kind, a)) === JSON.stringify(normalizePayload(kind, b))
}

/** The status after the producer edits the working copy. Approved items are locked (reopen first). */
export function statusAfterFigureEdit(status: FigureStatus, hasApproved: boolean): FigureStatus | null {
  if (status === 'approved' || status === 'pending_client') return null
  if (hasApproved) return 'edited_since_approval'
  return 'draft'
}

/** What changed between two approved versions, as readable pairs ("6,500+" → "6,800+"). Used for the Copy Library review reason and its "Apply this change". */
export function figureChangePairs(kind: FigureKind, label: string, oldP: FigurePayload, newP: FigurePayload): Pair[] {
  if (kind === 'figure') return oldP.display !== newP.display && (oldP.display || newP.display) ? [{ removed: oldP.display ?? '', added: newP.display ?? '' }] : []
  if (kind === 'outcome') return changedPhrases(oldP.text ?? '', newP.text ?? '')
  const out: Pair[] = []
  const oldRows = new Map((oldP.rows ?? []).map(r => [r.label.toLowerCase(), r]))
  for (const r of newP.rows ?? []) {
    const was = oldRows.get(r.label.toLowerCase())
    if (was && was.display !== r.display) out.push({ removed: was.display, added: r.display })
  }
  return out
}

/** "Footfall: '6,500+' → '6,800+'" */
export function figureChangeReason(label: string, pairs: Pair[], versionNote?: string): string {
  if (!pairs.length) return `${label}: re-approved${versionNote ? ` (${versionNote})` : ''}.`
  return `${label}: ${pairs.slice(0, 3).map(p => (p.added ? `'${p.removed}' → '${p.added}'` : `'${p.removed}' removed`)).join('; ')}`
}

/** Numbers as they appear in prose ("6,500+", "32.5", "USD 4 trillion+"): the digit runs only. */
export function numberTokens(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => m[0].replace(/[,.]+$/, ''))
}

/** Numbers in `text` that appear nowhere in `allowed`. A figures block may only repeat numbers the approved figures (or the event facts) already contain. */
export function unsupportedNumbers(text: string, allowed: string): string[] {
  const ok = new Set(numberTokens(allowed))
  return [...new Set(numberTokens(text).filter(n => !ok.has(n)))]
}

/** What a client sees of an item: never the source, the notes, the evidence or who owns it. */
export function clientView(i: { id: string; kind: FigureKind; category: string; group_label: string | null; label: string; working_payload: FigurePayload; basis: string }) {
  return { id: i.id, kind: i.kind, category: i.category, group_label: i.group_label, label: i.label, payload: i.working_payload, basis: i.basis }
}
