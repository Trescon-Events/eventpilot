/* Moving the statistics out of a messaging document into the Stats store (public figures), pure part: no database, no model.
   A model PROPOSES which rows of the document are statistics (by position); everything here VERIFIES each proposal against the document's real content before it is used, and
   removes exactly the rows it describes: nothing is rewritten, nothing is guessed. What was removed is recorded, so it can be read back and restored. */

export type Section = { id: string; title?: string; kind?: string; content?: unknown; [k: string]: unknown }
export type Phase = 'pre' | 'post'
export type At = { row: number } | { line: number } | { table: true }
export type Candidate = { section_id: string; at: At; label: string; value?: string; kind?: 'figure' | 'breakdown'; category?: string; group_label?: string | null; phase?: Phase }
export type PlanItem = {
  section_id: string; section_title: string; at: At; label: string; kind: 'figure' | 'breakdown'; category: string; group_label: string | null; phase: Phase
  display: string; rows?: Array<{ label: string; display: string }>; removed_text: string
}
export type LiftPlan = { items: PlanItem[]; rejected: Array<{ section_id: string; reason: string }> }

export const CATEGORY_KEYS = ['at_a_glance', 'programme', 'outcomes', 'audience', 'investors', 'competitions', 'media', 'digital'] as const
const hasDigit = (s: string) => /\d/.test(s)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

type TableContent = { columns?: string[]; rows?: string[][] }
const asTable = (c: unknown): TableContent | null => (c && typeof c === 'object' && !Array.isArray(c) && Array.isArray((c as TableContent).rows) ? (c as TableContent) : null)
const asFacts = (c: unknown): Array<{ fact?: string; detail?: string; source?: string }> | null => (Array.isArray(c) ? (c as Array<{ fact?: string; detail?: string; source?: string }>) : null)

/** What the model is shown: every addressable row, numbered, so it can answer by position. */
export function describeSections(sections: Section[]): string {
  return sections.map(s => {
    const head = `[${s.id}] ${s.title ?? ''} (${s.kind ?? 'text'})`
    if (s.kind === 'facts' && asFacts(s.content)) return `${head}\n${asFacts(s.content)!.map((f, i) => `  row ${i}: ${f.fact ?? ''} = ${f.detail ?? ''}`).join('\n')}`
    if (s.kind === 'table' && asTable(s.content)) { const t = asTable(s.content)!; return `${head} columns: ${(t.columns ?? []).join(' | ')}\n${(t.rows ?? []).map((r, i) => `  row ${i}: ${r.join(' | ')}`).join('\n')}` }
    return `${head}\n${str(s.content).split('\n').map((l, i) => (l.trim() ? `  line ${i}: ${l}` : '')).filter(Boolean).join('\n')}`
  }).join('\n\n')
}

/** Checks each proposal against the real content. Anything that does not match is rejected with a reason, never "fixed". */
export function buildPlan(sections: Section[], candidates: Candidate[]): LiftPlan {
  const byId = new Map(sections.map(s => [s.id, s]))
  const items: PlanItem[] = [], rejected: LiftPlan['rejected'] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    const s = byId.get(c.section_id)
    const no = (reason: string) => rejected.push({ section_id: String(c.section_id), reason })
    if (!s) { no('no such section'); continue }
    const label = str(c.label).replace(/\s+/g, ' ').trim()
    if (!label) { no('no label'); continue }
    const at = c.at
    const key = `${s.id}|${JSON.stringify(at)}`
    if (seen.has(key)) { no('duplicate'); continue }
    const base = { section_id: s.id, section_title: str(s.title), label, category: (CATEGORY_KEYS as readonly string[]).includes(str(c.category)) ? str(c.category) : 'at_a_glance', group_label: c.group_label?.toString().trim() || null, phase: (c.phase === 'post' ? 'post' : 'pre') as Phase }
    if ('row' in at && s.kind === 'facts') {
      const f = asFacts(s.content)?.[at.row]
      if (!f) { no('no such row'); continue }
      const detail = str(f.detail).trim()
      if (!hasDigit(detail)) { no('the row has no number'); continue }
      items.push({ ...base, at, kind: 'figure', display: detail, removed_text: `${f.fact ?? ''}: ${detail}` }); seen.add(key); continue
    }
    if ('row' in at && s.kind === 'table') {
      const t = asTable(s.content); const r = t?.rows?.[at.row]
      if (!r) { no('no such row'); continue }
      const cells = r.map(x => String(x)); const numeric = cells.slice(1).find(hasDigit)
      if (!numeric) { no('the row has no number'); continue }
      items.push({ ...base, at, kind: 'figure', display: numeric.trim(), removed_text: cells.join(' | ') }); seen.add(key); continue
    }
    if ('line' in at && s.kind !== 'facts' && s.kind !== 'table') {
      const line = str(s.content).split('\n')[at.line]
      if (line === undefined || !line.trim()) { no('no such line'); continue }
      if (!/^\s*[-•]\s+/.test(line)) { no('only bullet lines are moved; narrative is left alone'); continue }
      if (!hasDigit(line)) { no('the line has no number'); continue }
      const text = line.replace(/^\s*[-•]\s+/, '').replace(/\*\*/g, '').trim()
      items.push({ ...base, at, kind: 'figure', display: str(c.value).trim() || text, removed_text: line.trim() }); seen.add(key); continue
    }
    if ('table' in at && s.kind === 'table') {
      const t = asTable(s.content)
      const rows = (t?.rows ?? []).map(r => ({ label: String(r[0] ?? '').trim(), display: r.slice(1).map(String).find(hasDigit)?.trim() ?? '' })).filter(r => r.label && r.display)
      if (rows.length < 2 || rows.length < (t?.rows ?? []).length) { no('not every row of the table is a labelled number'); continue }
      items.push({ ...base, at, kind: 'breakdown', display: '', rows, removed_text: (t?.rows ?? []).map(r => r.join(' | ')).join('\n') }); seen.add(key); continue
    }
    no('the position does not match the kind of section')
  }
  return { items, rejected }
}

/** Removes exactly the planned rows / lines / tables. A section left with nothing is dropped. Rows that no longer match what the plan saw are kept and reported as stale. */
export function applyRemovals(sections: Section[], plan: LiftPlan): { sections: Section[]; removed: PlanItem[]; stale: PlanItem[] } {
  const removed: PlanItem[] = [], stale: PlanItem[] = []
  const out = sections.map(s => ({ ...s }))
  for (const s of out) {
    const mine = plan.items.filter(i => i.section_id === s.id)
    if (!mine.length) continue
    if (s.kind === 'facts' && asFacts(s.content)) {
      const rows = [...asFacts(s.content)!]; const drop = new Set<number>()
      for (const i of mine) { if ('row' in i.at) { const f = rows[i.at.row]; if (f && `${f.fact ?? ''}: ${str(f.detail).trim()}` === i.removed_text) { drop.add(i.at.row); removed.push(i) } else stale.push(i) } }
      s.content = rows.filter((_, idx) => !drop.has(idx))
    } else if (s.kind === 'table' && asTable(s.content)) {
      const t = asTable(s.content)!; const rows = [...(t.rows ?? [])]; const drop = new Set<number>()
      for (const i of mine) {
        if ('row' in i.at) { const r = rows[i.at.row]; if (r && r.map(String).join(' | ') === i.removed_text) { drop.add(i.at.row); removed.push(i) } else stale.push(i) }
        else if ('table' in i.at) { if (rows.map(r => r.join(' | ')).join('\n') === i.removed_text) { rows.forEach((_, idx) => drop.add(idx)); removed.push(i) } else stale.push(i) }
      }
      s.content = { ...t, rows: rows.filter((_, idx) => !drop.has(idx)) }
    } else {
      const lines = str(s.content).split('\n'); const drop = new Set<number>()
      for (const i of mine) { if ('line' in i.at) { const l = lines[i.at.line]; if (l !== undefined && l.trim() === i.removed_text) { drop.add(i.at.line); removed.push(i) } else stale.push(i) } }
      s.content = lines.filter((_, idx) => !drop.has(idx)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    }
  }
  const empty = (s: Section) => (Array.isArray(s.content) ? s.content.length === 0 : asTable(s.content) ? (asTable(s.content)!.rows ?? []).length === 0 : !str(s.content).trim())
  const touched = new Set(removed.map(r => r.section_id))
  return { sections: out.filter(s => !(touched.has(s.id) && empty(s))), removed, stale }
}

/** Where a lifted statistic came from, for the Stats item's Source field. */
export const sourceLabel = (docTitle: string, version: number | null, i: Pick<PlanItem, 'section_title'>) => `Messaging doc "${docTitle}"${version ? ` v${version}` : ''}, section "${i.section_title}"`
