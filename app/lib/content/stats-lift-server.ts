import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { supabaseAdmin } from '@/app/lib/supabase'
import { ownerOfRow } from './owner'
import { FIGURE_CATALOGUE } from './public-figures-catalogue'
import { addCustom, addFromCatalogue, updateItem } from './public-figures'
import { figureKey, percentOf } from './public-figures-model'
import { CATEGORY_KEYS, applyRemovals, buildPlan, describeSections, sourceLabel, type Candidate, type LiftPlan, type PlanItem, type Section } from './stats-lift'

/* Messaging doc -> Stats store. The model proposes, stats-lift.ts verifies and removes; here: ask the model, create the Stats drafts, take the rows out of the document and record
   what was moved (structured_json.lifted_stats), so it can be read back. A statistic whose figure already exists with the SAME value just leaves the document; one that exists with a
   DIFFERENT value stays in the document and is reported as a conflict (nothing is overwritten). */

let _g: GoogleGenerativeAI | null = null
const gemini = () => (_g ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY!))

const PROMPT = `You are reading an event's messaging document, already split into numbered sections. Find the rows that are PURE STATISTICS: a count, percentage, amount of money, hours or other measured number about the event (attendance, speakers, sessions, countries, partners, exhibitors, media numbers, audience shares, prize money...).
NOT statistics: dates, times, years, addresses, phone numbers, names, titles, edition numbers, deadlines, anything that is a sentence of narrative or positioning.
Answer by position, never by rewriting:
- a "facts" or "table" row: {"section_id":"...","row":N,"label":"short name as in the document","kind":"figure","category":"..."}
- a bullet line ("- ...") in a text or rules section: {"section_id":"...","line":N,"label":"...","kind":"figure","category":"..."}  (never a narrative sentence)
- a whole table whose EVERY row is a label and a number (an audience split, for example): {"section_id":"...","table":true,"label":"title of the split","kind":"breakdown","category":"audience"}
"category" is one of: ${CATEGORY_KEYS.join(', ')}.
"phase" is "post" only when the row reports something that already happened (attended, recorded, achieved); expected, planned, target and "up to" numbers are "pre". When unsure, "pre".
Return JSON only: {"stats":[ ... ]}. If there are none, {"stats":[]}.

SECTIONS
`

async function proposeCandidates(sections: Section[]): Promise<Candidate[]> {
  const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL })
  const result = await model.generateContent([{ text: PROMPT + describeSections(sections).slice(0, 150_000) }])
  const m = result.response.text().match(/\{[\s\S]*\}/)
  const parsed = m ? JSON.parse(m[0]) as { stats?: Array<Record<string, unknown>> } : null
  return (parsed?.stats ?? []).map(s => ({
    section_id: String(s.section_id ?? ''),
    at: s.table === true ? { table: true as const } : typeof s.line === 'number' ? { line: s.line } : { row: Number(s.row ?? -1) },
    label: String(s.label ?? ''), value: '', kind: s.kind === 'breakdown' ? 'breakdown' as const : 'figure' as const, category: String(s.category ?? ''), phase: s.phase === 'post' ? 'post' as const : 'pre' as const,
  }))
}

type DocRow = { id: string; event_id: string | null; umbrella_id: string | null; org_scope: string | null; title: string; version: number | null; role: string; status: string; structured_json: Record<string, unknown> | null }
async function loadDoc(docId: string): Promise<DocRow> {
  const { data } = await supabaseAdmin.from('event_messaging_docs').select('id, event_id, umbrella_id, org_scope, title, version, role, status, structured_json').eq('id', docId).maybeSingle()
  if (!data) throw new Error('Messaging doc not found')
  return data as DocRow
}
const sectionsOf = (d: DocRow): Section[] => ((d.structured_json?.sections ?? []) as Section[])

/** Preview: what would move, what would be left alone and why. Writes nothing. */
export async function previewStatLift(docId: string): Promise<{ doc_title: string; plan: LiftPlan; already: number }> {
  const doc = await loadDoc(docId)
  if (!doc.event_id || doc.role !== 'messaging') throw new Error('Statistics are moved out of an event\'s messaging document only.')
  const plan = buildPlan(sectionsOf(doc), await proposeCandidates(sectionsOf(doc)))
  return { doc_title: doc.title, plan, already: ((doc.structured_json?.lifted_stats ?? []) as unknown[]).length }
}

export type LiftResult = { created: number; moved_same: number; kept_conflicts: Array<{ label: string; doc_value: string; stats_value: string; phase: string }>; stale: number; removed: number; structured: Record<string, unknown> }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const catalogueByLabel = new Map(FIGURE_CATALOGUE.map(e => [norm(e.label), e]))

/** Creates the Stats drafts, then removes the moved rows from the sections (returned, not yet saved). */
async function lift(doc: DocRow, candidatesPlan: LiftPlan, by: string | null): Promise<LiftResult> {
  const eventId = doc.event_id!
  const sections = sectionsOf(doc)
  const plan = buildPlan(sections, candidatesPlan.items.map(i => ({ section_id: i.section_id, at: i.at, label: i.label, value: i.display, kind: i.kind, category: i.category, group_label: i.group_label, phase: i.phase })))   // re-verified against the real content
  const { data: existing } = await supabaseAdmin.from('event_public_figures').select('phase, group_label, label, working_payload, kind').eq('event_id', eventId).eq('is_active', true)
  const have = new Map((existing ?? []).map(r => [`${r.phase}|${figureKey(r.group_label as string | null, r.label as string)}`, r]))
  let created = 0, movedSame = 0
  const conflicts: LiftResult['kept_conflicts'] = []
  const toRemove: PlanItem[] = []
  for (const i of plan.items) {
    const k = `${i.phase}|${figureKey(i.group_label, i.label)}`, cur = have.get(k)
    if (cur) {
      const curVal = String((cur.working_payload as { display?: string }).display ?? '')
      if (i.kind === 'figure' && norm(curVal) !== norm(i.display)) { conflicts.push({ label: i.label, doc_value: i.display, stats_value: curVal, phase: i.phase }); continue }
      movedSame++; toRemove.push(i); continue
    }
    const cat = catalogueByLabel.get(norm(i.label))
    const fig = cat && cat.kind === i.kind ? await addFromCatalogue(eventId, cat.key, i.group_label, by, i.phase) : await addCustom(eventId, { kind: i.kind, category: i.category, label: i.label, group_label: i.group_label }, by, i.phase)
    const payload = i.kind === 'breakdown' ? { title: i.label, rows: (i.rows ?? []).map(r => ({ label: r.label, display: r.display, ...(percentOf(r.display) !== null ? { percent: percentOf(r.display)! } : {}) })) } : { display: i.display }
    await updateItem(fig.id, { payload, source: sourceLabel(doc.title, doc.version, i) }, by)
    created++; toRemove.push(i)
  }
  const out = applyRemovals(sections, { items: toRemove, rejected: [] })
  const lifted = [...((doc.structured_json?.lifted_stats ?? []) as unknown[]), { at: new Date().toISOString(), by, items: out.removed.map(r => ({ section_id: r.section_id, section_title: r.section_title, label: r.label, phase: r.phase, removed_text: r.removed_text })) }]
  const structured = { ...(doc.structured_json ?? {}), sections: out.sections, lifted_stats: lifted, lift_conflicts: conflicts }
  return { created, moved_same: movedSame, kept_conflicts: conflicts, stale: out.stale.length, removed: out.removed.length, structured }
}

/** Apply a previewed plan to an existing document: Stats drafts created, rows removed, edit logged, effective set recompiled when the doc is live. */
export async function applyStatLift(docId: string, plan: LiftPlan, by: string | null): Promise<LiftResult> {
  const doc = await loadDoc(docId)
  if (!doc.event_id || doc.role !== 'messaging') throw new Error('Statistics are moved out of an event\'s messaging document only.')
  const r = await lift(doc, plan, by)
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('event_messaging_docs').update({ structured_json: r.structured, updated_at: now }).eq('id', docId)
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('event_messaging_doc_edits').insert({
    event_id: doc.event_id, umbrella_id: doc.umbrella_id, org_scope: doc.org_scope, doc_id: doc.id, section_id: 'stats_moved',
    instruction: `Moved ${r.removed} statistic${r.removed === 1 ? '' : 's'} to the Stats tab`, before_excerpt: plan.items.slice(0, 12).map(i => i.removed_text).join('\n').slice(0, 800), after_excerpt: `${r.created} new Stats drafts, ${r.moved_same} already in Stats`, applied_by: by, applied_at: now,
  }).then(({ error: e }) => { if (e) console.error('Failed to log stats move:', e) })
  if (doc.status === 'live') { const { recompileEventAndChildren } = await import('./compile-reference'); await recompileEventAndChildren(ownerOfRow(doc)) }
  return r
}

/** During upload: the same, automatically, on the NEW draft document (nothing is live yet, so nothing approved is edited). Never throws: on any failure the sections stay as extracted. */
export async function liftStatsAtUpload(docId: string, structured: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  try {
    if (!structured) return structured
    const doc = await loadDoc(docId)
    if (!doc.event_id || doc.role !== 'messaging') return structured
    const withNew: DocRow = { ...doc, structured_json: structured }
    const plan = buildPlan(sectionsOf(withNew), await proposeCandidates(sectionsOf(withNew)))
    if (!plan.items.length) return structured
    const r = await lift(withNew, plan, null)
    return r.structured
  } catch (e) { console.error(`[messaging-doc ${docId}] stats lift skipped:`, e instanceof Error ? e.message : e); return structured }
}
