import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import { ownerColumn, ownerInsertColumns, ownerLabel, type ContentOwnerRef } from './owner'
import { resolveEffectiveDocs } from './resolve-reference-docs'
import { resolveEffectiveRulesForOwner } from './resolve-validation-rules'
import { ruleErrorsFor, ruleFeedback, surfaceOf } from './copy-surface'
import { blockedSlots, type BlockedSlot } from './copy-blocked'
import { linksBlock, linksOf, missingLinks, shortNameHits, type EventLink } from './copy-event-name'
import { rulesForSurface, validateText, type Surface, type ValidationFinding, type ValidationRule } from './validate'
import { contentText } from './edit-diff'
import { COPY_CATALOGUE, CATALOGUE_BY_KEY, isValidVariant, starterVariants, type VariantLength, type VariantPhase } from './copy-catalogue'
import { docRefs, figureRefs, type DocSourceRef, applyPairs, cleanMirroredText, clientApprovalRequired, ctaLabelFromLibrary, forbiddenHits, isNotUsed, lengthViolations, pickItem, seedCtaText, reviewFinding, sectionHash, statusAfterEdit, type ItemStatus, type OwnerLevel, type SourceRef } from './copy-model'
import { getEffectiveStyleNotes } from './style-notes'
import { getPublicFigures, figureRefChanges, recordFigureUsage, type PublicFigure } from './public-figures-read'
import { NO_EVENT_FIGURES, NO_FIGURES_RULE, NO_STAT_CHECK, STAT_RULE, figureRefsIn, figuresForItem, figuresPromptBlock, unapprovedNumbers } from './copy-figures'
import { unsupportedNumbers } from './public-figures-model'

/* Copy Library, server side (docs/build_suggestions/copy-library.md). Tools read ONLY approved_text (§2.2). Every write is audited (§2.7).
   Every read helper used by a consumer fails open to "no library item" so a missing table or a database error can never change a tool's output (§2.1). */

export type ItemRow = {
  id: string; event_id: string | null; umbrella_id: string | null; org_scope: string | null
  asset_key: string; variant_length: VariantLength; variant_phase: VariantPhase
  working_text: string; approved_text: string | null; approved_version: number; status: ItemStatus
  source: 'generated' | 'manual' | 'from_doc'; source_refs: SourceRef[]
  approved_by: string | null; approved_at: string | null; client_bundle_id: string | null; review_reason: string | null
  updated_at: string
}
export const ITEM_COLS = 'id, event_id, umbrella_id, org_scope, asset_key, variant_length, variant_phase, working_text, approved_text, approved_version, status, source, source_refs, approved_by, approved_at, client_bundle_id, review_reason, updated_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actor = (id: string | null) => (id && UUID.test(id) ? id : null)

export async function logCopyChange(e: { item_id: string | null; owner: ContentOwnerRef; asset_key: string | null; action: string; before: unknown; after: unknown; by: string | null }): Promise<void> {
  const { error } = await supabaseAdmin.from('copy_library_changes').insert({
    item_id: e.item_id, owner: ownerLabel(e.owner), asset_key: e.asset_key, action: e.action, before: e.before ?? null, after: e.after ?? null, changed_by: actor(e.by),
  })
  if (error) throw new Error(`Could not record the copy library change: ${error.message}`)
}

export const levelOf = (row: { event_id: string | null; umbrella_id: string | null }): OwnerLevel => (row.event_id ? 'event' : row.umbrella_id ? 'umbrella' : 'org')

// ── Read API (§6) ───────────────────────────────────────────────────────────

type EventFacts = { id: string; type: string | null; umbrella_id: string | null; content_phase: 'pre' | 'post'; copy_requires_client_approval: boolean | null }
async function eventFacts(eventId: string): Promise<EventFacts | null> {
  const { data } = await supabaseAdmin.from('events').select('id, type, umbrella_id, content_phase, copy_requires_client_approval').eq('id', eventId).maybeSingle()
  return (data as EventFacts | null) ?? null
}

/** Approved items that could serve an event: its own, its umbrella's. */
async function approvedItemsFor(ev: EventFacts, assetKey: string): Promise<Array<ItemRow & { level: OwnerLevel }>> {
  const ors = [`event_id.eq.${ev.id}`]
  if (ev.umbrella_id) ors.push(`umbrella_id.eq.${ev.umbrella_id}`)
  const { data, error } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).eq('asset_key', assetKey).not('approved_text', 'is', null).or(ors.join(','))
  if (error) return []
  return ((data ?? []) as ItemRow[]).map(r => ({ ...r, level: levelOf(r) }))
}

/** getCopyItem(eventId, assetKey, { length?, phase? }): resolves event → umbrella (most specific wins), picks variant_phase = events.content_phase then 'any'.
    Returns the APPROVED text only, or null. Never throws. The caller records usage with recordUsage(). */
export async function getCopyItem(eventId: string, assetKey: string, opts: { length?: string; phase?: 'pre' | 'post' } = {}): Promise<{ text: string; item_id: string; version: number } | null> {
  try {
    const ev = await eventFacts(eventId)
    if (!ev) return null
    const items = await approvedItemsFor(ev, assetKey)
    const hit = pickItem(items, assetKey, { length: opts.length, phase: opts.phase ?? ev.content_phase })
    return hit ? { text: hit.approved_text as string, item_id: hit.id, version: hit.approved_version } : null
  } catch { return null }
}

export async function recordUsage(u: { item_id: string; version: number; consumer_type: string; consumer_id?: string | null; mode: 'live' | 'sent' }): Promise<void> {
  try { await supabaseAdmin.from('copy_library_usages').insert({ item_id: u.item_id, version: u.version, consumer_type: u.consumer_type, consumer_id: u.consumer_id ?? null, mode: u.mode }) }
  catch { /* usage is bookkeeping; never fail a tool over it */ }
}

/** SAE fixed lines (§6.1). Overlays the approved `cta` / `attribution_line` onto the event record the announcement code already reads.
    With no approved item the SAME object is returned untouched, so output is byte-identical to today. */
export async function withLibraryFixedLines<T extends { announcement_cta_label?: string | null; announcement_attribution_line?: string | null; registration_url?: string | null }>(
  eventId: string, event: T, consumerId?: string | null,
): Promise<T> {
  try {
    const [cta, attribution] = await Promise.all([getCopyItem(eventId, 'cta'), getCopyItem(eventId, 'attribution_line')])
    if (!cta && !attribution) return event
    const out = { ...event }
    if (cta) {
      const label = ctaLabelFromLibrary(cta.text, event.registration_url)
      if (label) { out.announcement_cta_label = label; await recordUsage({ item_id: cta.item_id, version: cta.version, consumer_type: 'sae_announcement', consumer_id: consumerId, mode: 'live' }) }
    }
    if (attribution && attribution.text.trim()) {
      out.announcement_attribution_line = attribution.text.trim()
      await recordUsage({ item_id: attribution.item_id, version: attribution.version, consumer_type: 'sae_announcement', consumer_id: consumerId, mode: 'live' })
    }
    return out
  } catch { return event }
}

/** Readiness input (§6.2): which fixed lines the library supplies, and which starter-set items have no approved version. Fails open to "unknown". */
export async function libraryReadiness(eventId: string): Promise<{ has_cta: boolean; has_attribution: boolean; missing: string[] } | null> {
  try {
    const ev = await eventFacts(eventId)
    if (!ev) return null
    const ors = [`event_id.eq.${ev.id}`]
    if (ev.umbrella_id) ors.push(`umbrella_id.eq.${ev.umbrella_id}`)
    const { data, error } = await supabaseAdmin.from('copy_library_items').select('asset_key, variant_length, variant_phase, approved_text').or(ors.join(','))
    if (error) return null
    // an item approved as "not used for this event" (empty text) is a decision, so it is not "missing" and it stops the attribution warning
    const decided = (data ?? []).filter(r => typeof r.approved_text === 'string')
    const approved = decided.filter(r => (r.approved_text ?? '').trim())
    const missing = COPY_CATALOGUE.filter(e => !e.fromDoc).filter(e => !decided.some(r => r.asset_key === e.key)).map(e => e.label)
    return { has_cta: approved.some(r => r.asset_key === 'cta'), has_attribution: decided.some(r => r.asset_key === 'attribution_line'), missing }
  } catch { return null }
}

// ── Loading for the UI ──────────────────────────────────────────────────────

export async function loadLibrary(owner: ContentOwnerRef): Promise<{ items: Array<ItemRow & { level: OwnerLevel; inherited: boolean }>; phase: 'pre' | 'post' | null; requires_client_approval: boolean; umbrella_id: string | null }> {
  let umbrellaId: string | null = owner.kind === 'umbrella' ? owner.id : null
  let phase: 'pre' | 'post' | null = null
  let requires = false
  if (owner.kind === 'event') {
    const ev = await eventFacts(owner.id)
    umbrellaId = ev?.umbrella_id ?? null; phase = ev?.content_phase ?? 'pre'
    requires = clientApprovalRequired(ev?.copy_requires_client_approval, ev?.type)
  } else if (owner.kind === 'umbrella') requires = false
  const ors: string[] = []
  if (owner.kind === 'event') ors.push(`event_id.eq.${owner.id}`)
  if (umbrellaId) ors.push(`umbrella_id.eq.${umbrellaId}`)
  if (!ors.length) return { items: [], phase, requires_client_approval: requires, umbrella_id: umbrellaId }
  const { data, error } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).or(ors.join(',')).order('asset_key')
  if (error) throw new Error(error.message)
  const items = ((data ?? []) as ItemRow[]).map(r => ({ ...r, level: levelOf(r), inherited: levelOf(r) !== owner.kind }))
  return { items, phase, requires_client_approval: requires, umbrella_id: umbrellaId }
}

export async function usageCounts(itemIds: string[]): Promise<Record<string, Record<string, number>>> {
  if (!itemIds.length) return {}
  const { data } = await supabaseAdmin.from('copy_library_usages').select('item_id, consumer_type').in('item_id', itemIds)
  const out: Record<string, Record<string, number>> = {}
  for (const u of data ?? []) { out[u.item_id] ??= {}; out[u.item_id][u.consumer_type] = (out[u.item_id][u.consumer_type] ?? 0) + 1 }
  return out
}

/** `surfaces[i]` is the kind of text `texts[i]` is (default 'social': every rule that applies to social copy, as before rule scopes existed). */
export async function findingsFor(owner: ContentOwnerRef, texts: string[], surfaces?: Surface[]): Promise<ValidationFinding[][]> {
  const rules = await resolveEffectiveRulesForOwner(owner, 'any').catch(() => [])
  return texts.map((t, i) => (t.trim() ? validateText(t, rulesForSurface(rules, surfaces?.[i] ?? 'social')) : []))
}

// ── Generation (§5) ─────────────────────────────────────────────────────────

type Section = { id: string; title: string; kind: string; text: string; doc_id: string; role: string }

async function messagingSections(owner: ContentOwnerRef): Promise<{ sections: Section[]; docRoles: Map<string, string> }> {
  const docs = await resolveEffectiveDocs(owner)
  const sections: Section[] = []
  for (const d of docs) {
    if (d.org_scope) continue // the Trescon-wide house style is context at most, never a source
    for (const s of (d.structured_json?.sections ?? []) as Array<Record<string, unknown>>) {
      sections.push({ id: String(s.id ?? ''), title: String(s.title ?? ''), kind: String(s.kind ?? 'text'), text: contentText(s.content), doc_id: d.id, role: d.role })
    }
  }
  return { sections: sections.filter(s => s.id && s.text.trim()), docRoles: new Map(docs.map(d => [d.id, d.role])) }
}

/** Reference text for tools outside the Copy Library (the session video text pack): the live documents' sections as plain text, WITHOUT facts and table sections (where an event's statistics live: session
 *  videos carry no event figures), plus the effective style notes. Never throws: no documents means empty blocks. */
export async function referenceForTools(owner: ContentOwnerRef): Promise<{ docBlock: string; noteBlock: string }> {
  const [{ sections }, notes] = await Promise.all([messagingSections(owner).catch(() => ({ sections: [] as Section[] })), getEffectiveStyleNotes(owner).catch(() => [])])
  const docBlock = sections.filter(s => s.kind !== 'facts' && s.kind !== 'table').map(s => `[${s.title}] (${s.role === 'messaging' ? 'messaging doc' : s.role === 'style_guide' ? 'style guide' : 'production pack'})\n${s.text}`).join('\n\n').slice(0, 60_000)
  return { docBlock, noteBlock: notes.length ? `STYLE NOTES:\n${notes.map(n => `- ${n.note}`).join('\n')}` : '' }
}

const toRef = (s: Section): SourceRef => ({ doc_id: s.doc_id, section_id: s.id, section_hash: sectionHash(s.text), section_title: s.title, section_text: s.text.slice(0, 8000) })

let _gemini: GoogleGenerativeAI | null = null
const gemini = () => (_gemini ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY!))

async function ownerFacts(owner: ContentOwnerRef): Promise<string> {
  if (owner.kind === 'event') {
    const { data: e } = await supabaseAdmin.from('events').select('name, public_name, public_dates_display, public_venue_display, event_hashtag, registration_url, content_phase').eq('id', owner.id).maybeSingle()
    if (!e) return ''
    return [`Event name: ${e.public_name || e.name}`, e.public_dates_display && `Dates: ${e.public_dates_display}`, e.public_venue_display && `Venue: ${e.public_venue_display}`, e.event_hashtag && `Hashtag: ${e.event_hashtag}`, e.registration_url && `Registration link: ${e.registration_url}`].filter(Boolean).join('\n')
  }
  const { data: u } = await supabaseAdmin.from('event_umbrellas').select('name').eq('id', owner.id).maybeSingle()
  return u ? `Series name: ${u.name}` : ''
}

/** The event's own name (public name, else name) and its website and social URLs: the name goes in every item in full, the links into the YouTube footer. Events only. */
async function eventNameAndLinks(owner: ContentOwnerRef): Promise<{ eventName?: string; links: EventLink[] }> {
  if (owner.kind !== 'event') return { links: [] }
  const { data: e } = await supabaseAdmin.from('events').select('name, public_name, website_url, social_linkedin, social_x, social_instagram, social_facebook, social_youtube').eq('id', owner.id).maybeSingle()
  return { eventName: ((e?.public_name as string | null) || (e?.name as string | null) || undefined) ?? undefined, links: linksOf(e as Record<string, unknown> | null) }
}

export type GenerateResult = { created: string[]; skipped: string[]; failed: Array<{ key: string; error: string }>; /** drafts that still carry an error-level rule finding after the one regeneration; the item shows the finding */ rule_errors?: number; /** slots that cannot be generated yet (missing Common Details label or quotes section): not failures, shown highlighted with what to do */ blocked?: BlockedSlot[] }
type Draft = { length: VariantLength; phase: VariantPhase; text: string; refs: SourceRef[]; ruleErrors?: number }
type GenContext = { messaging: Section[]; docBlock: string; noteBlock: string; facts: string; figures: { pre: PublicFigure[]; post: PublicFigure[] }; rules?: ValidationRule[]; eventName?: string; links?: EventLink[] }
const NO_FIGURES = { pre: [] as PublicFigure[], post: [] as PublicFigure[] }

/** The approved figures of each phase: the only source of statistics in generated copy (an umbrella has none of its own). */
async function loadFigures(owner: ContentOwnerRef): Promise<{ pre: PublicFigure[]; post: PublicFigure[] }> {
  if (owner.kind !== 'event') return NO_FIGURES
  const [pre, post] = await Promise.all([getPublicFigures(owner.id, { phase: 'pre' }), getPublicFigures(owner.id, { phase: 'post' })])
  return { pre, post }
}

async function buildContext(owner: ContentOwnerRef): Promise<GenContext> {
  const [{ sections }, notes, facts, figures, rules, nl] = await Promise.all([messagingSections(owner), getEffectiveStyleNotes(owner), ownerFacts(owner), loadFigures(owner), resolveEffectiveRulesForOwner(owner, 'any').catch(() => [] as ValidationRule[]), eventNameAndLinks(owner)])
  const messaging = sections.filter(s => s.role === 'messaging')
  if (!messaging.length) throw new Error('There is no live messaging document to build from. Approve a messaging document first.')
  const docBlock = sections.map(s => `[${s.id}] ${s.title} (${s.role === 'messaging' ? 'messaging doc' : s.role === 'style_guide' ? 'style guide, context only' : 'production pack, context only'})\n${s.text}`).join('\n\n').slice(0, 90_000)
  const noteBlock = notes.length ? `STYLE NOTES (writing guidance; the documents above win if they disagree):\n${notes.map(n => `- ${n.note}`).join('\n')}` : ''
  return { messaging, docBlock, noteBlock, facts, figures, rules, eventName: nl.eventName, links: nl.links }
}

/** approved_quotes: the document's words, never generated. Markdown markers are stripped and quote marks made curly (cleanMirroredText); the words are untouched. */
function quotesFromDoc(ctx: GenContext): { text: string; refs: SourceRef[] } | null {
  const secs = ctx.messaging.filter(s => /quote/i.test(s.title))
  return secs.length ? { text: cleanMirroredText(secs.map(s => s.text.trim()).join('\n\n')), refs: secs.map(toRef) } : null
}

async function draftEntry(ctx: GenContext, entry: typeof COPY_CATALOGUE[number], wanted: Array<{ length: VariantLength; phase: VariantPhase }>, feedback = ''): Promise<Draft[]> {
  const variantSpec = wanted.map((v, i) => `${i + 1}. length="${v.length}" phase="${v.phase}"${entry.wordTarget?.[v.length] ? ` — ${entry.wordTarget[v.length]}` : ''}`).join('\n')
  const prompt = `You write ready-to-use event copy for Trescon, an event organiser. You are building one reusable "${entry.label}" item from the event's approved documents.

EVENT FACTS
${ctx.facts}
${entry.key === 'youtube_footer' ? `\n${linksBlock(ctx.links ?? [])}\n` : ''}
DOCUMENTS (each section has an id in square brackets)
${ctx.docBlock}

${NO_STAT_CHECK.has(entry.key) || NO_EVENT_FIGURES.has(entry.key) ? '' : figuresPromptBlock(ctx.figures)}

${ctx.noteBlock}

TASK
${entry.guidance}

Write these variants:
${variantSpec}

HARD RULES
- Use only facts, names and titles that appear in the documents or event facts above. Never invent, round or estimate.
${ctx.eventName ? `- EVENT NAME: every time you name the event, write it exactly as "${ctx.eventName}" (the Event name in EVENT FACTS), even if the documents use a shorter form. Never drop the year or shorten it. A short reference such as "the Summit" is fine.\n` : ''}${NO_STAT_CHECK.has(entry.key) ? '' : (NO_EVENT_FIGURES.has(entry.key) ? NO_FIGURES_RULE : STAT_RULE) + '\n'}
- Spell every name exactly as the documents spell it.
- Do not use em dashes. Plain, specific language; no filler such as "excited to announce".
- "pre" means the event has not happened yet (future tense); "post" means it has concluded (past tense); "any" must read correctly in both cases.
${feedback ? `\nFIX THESE PROBLEMS FROM YOUR LAST ATTEMPT\n${feedback}\n` : ''}- Return JSON only: {"variants":[{"length":"...","phase":"...","text":"...","used_section_ids":["id", ...]}]}. used_section_ids lists the MESSAGING DOC sections the text relies on.`
  const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
  const raw = await generateCopy(model, prompt, `copy-library:${entry.key}`)
  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as { variants?: Array<{ length: string; phase: string; text: string; used_section_ids?: string[] }> }
  const out: Draft[] = []
  for (const v of wanted) {
    const got = parsed.variants?.find(x => x.length === v.length && x.phase === v.phase)
    if (!got || typeof got.text !== 'string' || !got.text.trim()) continue
    const ids = new Set(got.used_section_ids ?? [])
    const used = ctx.messaging.filter(sec => ids.has(sec.id))
    const text = got.text.trim()
    const figRefs: SourceRef[] = NO_STAT_CHECK.has(entry.key) ? [] : figureRefsIn(text, figuresForItem(entry.key, v.phase, ctx.figures)).map(f => ({ type: 'public_figure', figure_id: f.id, version: f.version }))
    out.push({ length: v.length, phase: v.phase, text, refs: [...(used.length ? used : ctx.messaging).map(toRef), ...figRefs] })
  }
  return out
}

/** Drafts an entry and checks it: a shorter variant must be shorter than a longer one, no forbidden word may appear, statistics must be approved figures, and no error-level style rule may be broken.
 *  Generate, check, and if anything is wrong regenerate ONCE with every problem named; after that the draft is kept (a length or forbidden-word problem is refused), and any rule error that
 *  remains shows on the item for the producer to fix (never a hard failure). */
async function draftChecked(ctx: GenContext, entry: typeof COPY_CATALOGUE[number], wanted: Array<{ length: VariantLength; phase: VariantPhase }>): Promise<Draft[]> {
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const drafts = await draftEntry(ctx, entry, wanted, feedback)
    const problems = [...lengthViolations(drafts), ...drafts.flatMap(d => forbiddenHits(d.text, entry.forbidden).map(w => `The ${d.length}/${d.phase} text uses the word "${w}". Do not use it.`))]
    // statistics must be approved figures of that variant's phase: one retry with the numbers named; after that the draft is kept and the number shows as a warning on the item (never a hard failure)
    const numbers = NO_STAT_CHECK.has(entry.key) ? [] : drafts.flatMap(d => { const bad = unapprovedNumbers(d.text, figuresForItem(entry.key, d.phase, ctx.figures), ctx.facts); return bad.length ? [`The ${d.length}/${d.phase} text uses ${bad.join(', ')}, which ${bad.length === 1 ? 'is' : 'are'} not an approved figure for that phase. Remove ${bad.length === 1 ? 'it' : 'them'}${NO_EVENT_FIGURES.has(entry.key) ? ': this text carries no event figures.' : ' or use only the APPROVED FIGURES.'}`] : [] })
    // the event's own name, in full (documents often use a shorter form), and for the YouTube footer every recorded website / social URL
    const names = ctx.eventName ? drafts.flatMap(d => shortNameHits(d.text, ctx.eventName) ? [`The ${d.length}/${d.phase} text names the event without its year. Write "${ctx.eventName}" every time you name it.`] : []) : []
    const links = entry.key === 'youtube_footer' ? drafts.flatMap(d => { const m = missingLinks(d.text, ctx.links ?? []); return m.length ? [`The ${d.length}/${d.phase} text is missing these exact URLs from EVENT LINKS: ${m.map(l => `${l.label}: ${l.url}`).join(' | ')}. Write each channel as "Label: URL", never a label alone.`] : [] }) : []
    const ruleErrs = drafts.map(d => ruleErrorsFor(ctx.rules, entry.key, d))
    const rules = drafts.flatMap((d, i) => ruleFeedback(d, ruleErrs[i]))
    if (!problems.length && !numbers.length && !rules.length && !names.length && !links.length) return drafts
    if (attempt === 1) { if (problems.length) throw new Error(problems.join(' ')); return drafts.map((d, i) => ({ ...d, ruleErrors: ruleErrs[i].length })) }
    feedback = [...problems, ...numbers, ...names, ...links, ...rules].join('\n')
  }
  return []
}

/** The event's Common Details, which seed the before-event call to action and decide whether an attribution line applies. */
async function commonDetails(owner: ContentOwnerRef): Promise<{ cta_label: string | null; registration_url: string | null; attribution: string | null } | null> {
  if (owner.kind !== 'event') return null
  const { data } = await supabaseAdmin.from('events').select('announcement_cta_label, registration_url, announcement_attribution_line').eq('id', owner.id).maybeSingle()
  return data ? { cta_label: data.announcement_cta_label ?? null, registration_url: data.registration_url ?? null, attribution: data.announcement_attribution_line ?? null } : null
}

/** "Generate starter set": creates the items that do not exist yet (never overwrites an existing item). One model call per catalogue key. */
export async function generateStarterSet(owner: ContentOwnerRef, by: string | null, onlyKeys?: string[]): Promise<GenerateResult> {
  if (owner.kind === 'org') throw new Error('Copy is generated for an event or an umbrella, not Trescon-wide.')
  const { column, value } = ownerColumn(owner)
  let noDocs: string | null = null
  const [ctx, existing, details] = await Promise.all([buildContext(owner).catch(async e => { noDocs = e instanceof Error ? e.message : String(e); return lightContext(owner) }), supabaseAdmin.from('copy_library_items').select('asset_key, variant_length, variant_phase').eq(column, value), commonDetails(owner)])
  const have = new Set((existing.data ?? []).map(r => `${r.asset_key}|${r.variant_length}|${r.variant_phase}`))
  const result: GenerateResult = { created: [], skipped: [], failed: [] }

  const insert = async (key: string, v: { length: VariantLength; phase: VariantPhase }, text: string, refs: SourceRef[], source: 'generated' | 'from_doc' | 'manual') => {
    const { data, error } = await supabaseAdmin.from('copy_library_items').insert({ ...ownerInsertColumns(owner), asset_key: key, variant_length: v.length, variant_phase: v.phase, working_text: text, status: source === 'from_doc' ? 'in_internal_review' : 'draft', source, source_refs: refs }).select(ITEM_COLS).single()
    if (error) throw new Error(error.message)
    await logCopyChange({ item_id: data.id, owner, asset_key: key, action: source === 'from_doc' ? 'create_from_doc' : source === 'manual' ? 'create_seeded' : 'create_generated', before: null, after: data, by })
    for (const r of figureRefs(refs)) await recordFigureUsage({ figure_id: r.figure_id, version: r.version, consumer_type: 'copy_library_item', consumer_id: data.id, mode: 'live' })
  }

  const run = async (entry: typeof COPY_CATALOGUE[number]) => {
    const wanted = entry.variants.filter(v => !have.has(`${entry.key}|${v.length}|${v.phase}`))
    if (!wanted.length) { result.skipped.push(entry.key); return }
    try {
      if (entry.fromDoc) {
        const q = quotesFromDoc(ctx)
        if (!q) return   // reported as a blocked slot below, with what to do: not a failure
        await insert(entry.key, wanted[0], q.text, q.refs, 'from_doc')
        result.created.push(entry.key); return
      }
      let toDraft = wanted
      let made = 0
      // attribution line: an event with no attribution line in Common Details does not use one. Recorded as a decision (approved as "not used"), never generated.
      if (entry.key === 'attribution_line' && details && !(details.attribution ?? '').trim()) {
        for (const v of wanted) { await insertNotUsed(owner, entry.key, v, by, 'default_not_used', 'The event has no attribution line in Common Details.'); made++ }
        toDraft = []
      }
      // call to action, before the event: copied from Common Details so it matches what is live today. Only the after-event one is generated.
      if (entry.key === 'cta' && details) {
        const pre = wanted.find(v => v.phase === 'pre')
        if (pre) {
          const seed = seedCtaText(details.cta_label, details.registration_url)
          if (seed) { await insert(entry.key, pre, seed, [], 'manual'); made++ }
          // no label: reported as a blocked slot below, with what to do: not a failure
          toDraft = toDraft.filter(v => v !== pre)
        }
      }
      // key figures after the event: grounded on the event's approved public figures when it has any (no messaging document needed)
      if (entry.key === 'figures_block' && owner.kind === 'event') {
        const post = toDraft.filter(v => v.phase === 'post')
        const figs = post.length ? await figuresForBlock(owner.id) : []
        if (figs.length) {
          const drafts = await draftFromFigures(ctx, entry, post, figs)
          for (const d of drafts) await insert(entry.key, d, d.text, d.refs, 'generated')
          made += drafts.length
          toDraft = toDraft.filter(v => v.phase !== 'post')
        }
      }
      if (toDraft.length && noDocs) throw new Error(noDocs)
      if (toDraft.length) {
        const drafts = await draftChecked(ctx, entry, toDraft)
        for (const d of drafts) await insert(entry.key, d, d.text, d.refs, 'generated')
        result.rule_errors = (result.rule_errors ?? 0) + drafts.filter(d => (d.ruleErrors ?? 0) > 0).length
        made += drafts.length
        if (!drafts.length) result.failed.push({ key: entry.key, error: 'The model returned no usable text.' })
      }
      if (made) result.created.push(entry.key)
    } catch (e) { result.failed.push({ key: entry.key, error: e instanceof Error ? e.message : String(e) }) }
  }
  const entries = COPY_CATALOGUE.filter(e => !onlyKeys || onlyKeys.includes(e.key))
  // Six at a time: stays well under the ~100s proxy limit.
  for (let i = 0; i < entries.length; i += 6) await Promise.all(entries.slice(i, i + 6).map(run))
  const { data: nowHave } = await supabaseAdmin.from('copy_library_items').select('asset_key, variant_length, variant_phase').eq(column, value)
  const blocked = blockedSlots({ ownedSlots: new Set((nowHave ?? []).map(r => `${r.asset_key}|${r.variant_length}|${r.variant_phase}`)), ctaLabel: details?.cta_label, registrationUrl: details?.registration_url, hasQuotesSection: !!quotesFromDoc(ctx) })
    .filter(b => !onlyKeys || onlyKeys.includes(b.key))
  if (blocked.length && owner.kind === 'event') result.blocked = blocked
  return result
}

// ── Edit / approve (§5) ─────────────────────────────────────────────────────

export class CopyError extends Error { constructor(msg: string, public status = 400, public extra?: Record<string, unknown>) { super(msg) } }

async function loadItem(id: string): Promise<{ item: ItemRow; owner: ContentOwnerRef }> {
  const { data } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).eq('id', id).maybeSingle()
  if (!data) throw new CopyError('Item not found.', 404)
  const item = data as ItemRow
  return { item, owner: item.event_id ? { kind: 'event', id: item.event_id } : item.umbrella_id ? { kind: 'umbrella', id: item.umbrella_id } : { kind: 'org', id: 'trescon' } }
}
export async function ownerOfItem(id: string): Promise<ContentOwnerRef> { return (await loadItem(id)).owner }

export async function editItem(id: string, text: string, by: string | null): Promise<ItemRow> {
  const { item, owner } = await loadItem(id)
  if (item.source === 'from_doc') throw new CopyError('This item mirrors the messaging document and cannot be edited here. Change the document instead.', 409)
  if (item.status === 'pending_client') throw new CopyError('This item is with the client for approval. Wait for the decision, or ask them to request changes.', 409)
  if (isNotUsed(item.approved_text)) throw new CopyError('This item is marked “Not used for this event”. Use it again before editing it.', 409)
  const status = statusAfterEdit(item.status, !!item.approved_text)
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({ working_text: text, status, updated_at: new Date().toISOString() }).eq('id', id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  await logCopyChange({ item_id: id, owner, asset_key: item.asset_key, action: 'edit', before: { working_text: item.working_text, status: item.status }, after: { working_text: data.working_text, status: data.status }, by })
  return data as ItemRow
}

/** Apply the needs-review suggestion to the working text, or confirm the item still reads right (clears the flag without editing). */
export async function applyReviewChange(id: string, mode: 'apply' | 'dismiss', by: string | null): Promise<ItemRow> {
  const { item, owner } = await loadItem(id)
  if (item.status !== 'needs_review') throw new CopyError('This item is not waiting for review.', 409)
  let text = item.working_text
  const figChange = await figureRefChanges(figureRefs(item.source_refs))
  if (mode === 'apply') {
    const current = await currentSectionsFor(owner).catch(() => [] as Section[])
    const f = reviewFinding(docRefs(item.source_refs), snapshots(docRefs(item.source_refs), current), item.working_text)
    const next = applyPairs(item.working_text, [...f.pairs, ...figChange.pairs])
    if (next === null) throw new CopyError('The changed wording does not appear in this text. Edit it by hand or use Regenerate.', 409)
    text = next
  }
  // Re-baseline the item on the sections as they are now.
  const current = await currentSectionsFor(owner).catch(() => [] as Section[])
  const refs: SourceRef[] = item.source_refs.map(r => {
    if (r.type === 'public_figure') return { ...r, version: figChange.current.get(r.figure_id) ?? r.version }
    const s = matchSection(r, current); return s ? { ...r, doc_id: s.doc_id, section_id: s.id, section_hash: sectionHash(s.text), section_text: s.text.slice(0, 8000) } : r
  })
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({ working_text: text, source_refs: refs, status: item.approved_text ? 'edited_since_approval' : 'draft', review_reason: null, updated_at: new Date().toISOString() }).eq('id', id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  await logCopyChange({ item_id: id, owner, asset_key: item.asset_key, action: mode === 'apply' ? 'apply_review_change' : 'dismiss_review', before: { working_text: item.working_text, status: item.status, review_reason: item.review_reason }, after: { working_text: data.working_text, status: data.status }, by })
  return data as ItemRow
}

export async function regenerateItem(id: string, by: string | null): Promise<ItemRow> {
  const { item, owner } = await loadItem(id)
  if (owner.kind === 'org') throw new CopyError('Not available at this level.', 409)
  if (isNotUsed(item.approved_text)) throw new CopyError('This item is marked “Not used for this event”. Use it again first.', 409)
  const details = await commonDetails(owner)
  if (item.asset_key === 'cta' && item.variant_phase === 'pre' && details) {
    const seed = seedCtaText(details.cta_label, details.registration_url)
    if (!seed) throw new CopyError('Common Details has no call-to-action label to copy.', 409)
    return setWorkingText(item, owner, seed, [], by, 'reseed_from_common_details')
  }
  if (item.asset_key === 'figures_block' && item.variant_phase === 'post' && owner.kind === 'event') {
    const figs = await figuresForBlock(owner.id)
    const entry = CATALOGUE_BY_KEY.get('figures_block')
    if (figs.length && entry) {
      const [d] = await draftFromFigures(await lightContext(owner), entry, [{ length: item.variant_length, phase: item.variant_phase }], figs).catch(e => { throw new CopyError(`Regeneration failed; the previous text was kept. ${e instanceof Error ? e.message : ''}`.trim(), 502) })
      if (!d) throw new CopyError('The model returned no usable text; the previous text was kept.', 502)
      const out = await setWorkingText(item, owner, d.text, d.refs, by, 'regenerate')
      for (const r of figureRefs(d.refs)) await recordFigureUsage({ figure_id: r.figure_id, version: r.version, consumer_type: 'copy_library_item', consumer_id: item.id, mode: 'live' })
      return out
    }
  }
  const ctx = await buildContext(owner).catch(e => { throw new CopyError(e instanceof Error ? e.message : String(e), 409) })
  let text: string, refs: SourceRef[]
  if (item.source === 'from_doc') {
    const q = quotesFromDoc(ctx)
    if (!q) throw new CopyError('The quotes section is no longer in the document.', 409)
    ;({ text, refs } = q)
  } else {
    const entry = CATALOGUE_BY_KEY.get(item.asset_key)
    if (!entry) throw new CopyError('Unknown catalogue item.', 409)
    const [d] = await draftChecked(ctx, entry, [{ length: item.variant_length, phase: item.variant_phase }]).catch(e => { throw new CopyError(`Regeneration failed; the previous text was kept. ${e instanceof Error ? e.message : ''}`.trim(), 502) })
    if (!d) throw new CopyError('The model returned no usable text; the previous text was kept.', 502)
    // against its siblings: a short must stay shorter than the long of the same phase
    const { data: sib } = await supabaseAdmin.from('copy_library_items').select('variant_length, variant_phase, working_text, id').eq('asset_key', item.asset_key).eq(item.event_id ? 'event_id' : item.umbrella_id ? 'umbrella_id' : 'org_scope', item.event_id ?? item.umbrella_id ?? item.org_scope).neq('id', item.id)
    const bad = lengthViolations([{ length: item.variant_length, phase: item.variant_phase, text: d.text }, ...(sib ?? []).filter(x => x.working_text?.trim()).map(x => ({ length: x.variant_length as string, phase: x.variant_phase as string, text: x.working_text as string }))])
      .filter(m => m.includes(`${item.variant_length.replace('_', '-')} version`))
    if (bad.length) throw new CopyError(`Regeneration failed; the previous text was kept. ${bad[0]}`, 502)
    text = d.text; refs = d.refs
  }
  // The approved text stays in force until the new text is approved.
  const status: ItemStatus = item.approved_text ? 'edited_since_approval' : 'draft'
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({ working_text: text, source_refs: refs, status, review_reason: null, updated_at: new Date().toISOString() }).eq('id', id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  await logCopyChange({ item_id: id, owner, asset_key: item.asset_key, action: 'regenerate', before: { working_text: item.working_text, status: item.status }, after: { working_text: text, status }, by })
  for (const r of figureRefs(refs)) await recordFigureUsage({ figure_id: r.figure_id, version: r.version, consumer_type: 'copy_library_item', consumer_id: id, mode: 'live' })
  return data as ItemRow
}

async function setWorkingText(item: ItemRow, owner: ContentOwnerRef, text: string, refs: SourceRef[], by: string | null, action: string): Promise<ItemRow> {
  const status: ItemStatus = item.approved_text ? 'edited_since_approval' : 'draft'
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({ working_text: text, source_refs: refs, status, review_reason: null, updated_at: new Date().toISOString() }).eq('id', item.id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  await logCopyChange({ item_id: item.id, owner, asset_key: item.asset_key, action, before: { working_text: item.working_text, status: item.status }, after: { working_text: text, status }, by })
  return data as ItemRow
}

/** Creates an item that is already approved as "not used for this event" (empty approved text). Consumers then fall back to what they do today. */
async function insertNotUsed(owner: ContentOwnerRef, key: string, v: { length: VariantLength; phase: VariantPhase }, by: string | null, action: string, why: string): Promise<void> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('copy_library_items').insert({
    ...ownerInsertColumns(owner), asset_key: key, variant_length: v.length, variant_phase: v.phase, working_text: '', approved_text: '', approved_version: 1, status: 'approved', source: 'manual', source_refs: [], approved_by: actor(by), approved_at: now,
  }).select(ITEM_COLS).single()
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('copy_library_versions').insert({ item_id: data.id, version: 1, text: '', approved_by: actor(by), approved_at: now })
  await logCopyChange({ item_id: data.id, owner, asset_key: key, action, before: null, after: { ...data, reason: why }, by })
}

/** The slots that cannot be generated yet, for the highlighted callouts (events only: an umbrella has no Common Details). */
export async function blockedSlotsFor(owner: ContentOwnerRef, items: Array<{ asset_key: string; variant_length: string; variant_phase: string }>): Promise<BlockedSlot[]> {
  if (owner.kind !== 'event') return []
  const [details, { sections }] = await Promise.all([commonDetails(owner), messagingSections(owner).catch(() => ({ sections: [] as Section[] }))])
  return blockedSlots({
    ownedSlots: new Set(items.map(i => `${i.asset_key}|${i.variant_length}|${i.variant_phase}`)), ctaLabel: details?.cta_label, registrationUrl: details?.registration_url,
    hasQuotesSection: sections.some(sec => sec.role === 'messaging' && /quote/i.test(sec.title)),
  })
}

/** "Not used for this event" for a slot that has no item yet (nothing was generated): records the decision as an approved-empty item, exactly like the generated-then-marked path. */
export async function markSlotNotUsed(owner: ContentOwnerRef, key: string, length: string, phase: string, by: string | null): Promise<void> {
  if (owner.kind === 'org') throw new CopyError('Copy is kept for an event or an umbrella.', 400)
  const entry = CATALOGUE_BY_KEY.get(key)
  const v = entry?.variants.find(x => x.length === length && x.phase === phase)
  if (!entry || !v) throw new CopyError('Unknown catalogue item.', 400)
  const { column, value } = ownerColumn(owner)
  const { data: have } = await supabaseAdmin.from('copy_library_items').select('id').eq(column, value).eq('asset_key', key).eq('variant_length', length).eq('variant_phase', phase).maybeSingle()
  if (have) throw new CopyError('This item already exists. Use its own "Not used for this event" button.', 409)
  await insertNotUsed(owner, key, v, by, 'mark_not_used', 'Marked not used before it was generated.')
}

/** "Not used for this event": approved as empty. Tools that read this item fall back to today's behaviour; the previous text is kept so it can be used again. */
export async function markNotUsed(id: string, by: string | null): Promise<ItemRow> {
  const { item, owner } = await loadItem(id)
  if (item.status === 'pending_client') throw new CopyError('This item is with the client for approval. Wait for the decision first.', 409)
  if (isNotUsed(item.approved_text)) throw new CopyError('Already marked as not used.', 409)
  const version = item.approved_version + 1
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({ approved_text: '', approved_version: version, status: 'approved', approved_by: actor(by), approved_at: now, client_bundle_id: null, review_reason: null, updated_at: now }).eq('id', id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  const v = await supabaseAdmin.from('copy_library_versions').insert({ item_id: id, version, text: '', approved_by: actor(by), approved_at: now })
  if (v.error) throw new CopyError(`Marked, but the version record failed: ${v.error.message}`, 500)
  await logCopyChange({ item_id: id, owner, asset_key: item.asset_key, action: 'mark_not_used', before: { approved_text: item.approved_text, approved_version: item.approved_version, status: item.status }, after: { approved_text: '', approved_version: version, status: 'approved' }, by })
  return data as ItemRow
}

/** Undo "not used": the item goes back to a draft with no approved text, so tools keep today's behaviour until it is approved. */
export async function restoreUse(id: string, by: string | null): Promise<ItemRow> {
  const { item, owner } = await loadItem(id)
  if (!isNotUsed(item.approved_text)) throw new CopyError('This item is not marked as not used.', 409)
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({ approved_text: null, status: 'draft', approved_by: null, approved_at: null, updated_at: new Date().toISOString() }).eq('id', id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  await logCopyChange({ item_id: id, owner, asset_key: item.asset_key, action: 'use_again', before: { approved_text: '', status: item.status }, after: { approved_text: null, status: 'draft' }, by })
  return data as ItemRow
}

/** Errors that block submission (§5): error-level findings against the event's effective rules. */
export async function blockingFindings(owner: ContentOwnerRef, text: string, surface: Surface = 'social'): Promise<ValidationFinding[]> {
  const [f] = await findingsFor(owner, [text], [surface])
  return f.filter(x => x.severity === 'error')
}

async function writeApproved(item: ItemRow, owner: ContentOwnerRef, by: string | null, bundleId: string | null, action: string): Promise<ItemRow> {
  const version = item.approved_version + 1
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('copy_library_items').update({
    approved_text: item.working_text, approved_version: version, status: 'approved', approved_by: actor(by), approved_at: now, client_bundle_id: bundleId, review_reason: null, updated_at: now,
  }).eq('id', item.id).select(ITEM_COLS).single()
  if (error) throw new CopyError(error.message, 500)
  const v = await supabaseAdmin.from('copy_library_versions').insert({ item_id: item.id, version, text: item.working_text, approved_by: actor(by), approved_at: now })
  if (v.error) throw new CopyError(`Approved, but the version record failed: ${v.error.message}`, 500)
  await logCopyChange({ item_id: item.id, owner, asset_key: item.asset_key, action, before: { approved_text: item.approved_text, approved_version: item.approved_version, status: item.status }, after: { approved_text: data.approved_text, approved_version: version, status: 'approved', client_bundle_id: bundleId }, by })
  return data as ItemRow
}

/** Approve internally (§5): a person with sae.forms.manage. Error-level findings block it. With client approval required the item moves to
    in_internal_review (ready for the bundle); otherwise it becomes approved straight away. */
export async function approveInternally(id: string, by: string | null): Promise<ItemRow> {
  const { item, owner } = await loadItem(id)
  if (!item.working_text.trim()) throw new CopyError('There is no text to approve.', 409)
  if (item.status === 'pending_client') throw new CopyError('Already with the client.', 409)
  if (item.status === 'approved') throw new CopyError('Already approved.', 409)
  const errs = await blockingFindings(owner, item.working_text, surfaceOf(item.asset_key, item.variant_length))
  if (errs.length) throw new CopyError(`${errs.length} rule error${errs.length === 1 ? '' : 's'} must be fixed first: ${errs[0].message}`, 409, { findings: errs })
  let requires = false
  if (owner.kind === 'event') { const ev = await eventFacts(owner.id); requires = clientApprovalRequired(ev?.copy_requires_client_approval, ev?.type) }
  else if (owner.kind === 'umbrella') { const { data: u } = await supabaseAdmin.from('event_umbrellas').select('type, client_name').eq('id', owner.id).maybeSingle(); requires = !!(u?.client_name ?? '').trim() }
  if (requires) {
    const { data, error } = await supabaseAdmin.from('copy_library_items').update({ status: 'in_internal_review', updated_at: new Date().toISOString() }).eq('id', id).select(ITEM_COLS).single()
    if (error) throw new CopyError(error.message, 500)
    await logCopyChange({ item_id: id, owner, asset_key: item.asset_key, action: 'approve_internal', before: { status: item.status }, after: { status: 'in_internal_review' }, by })
    return data as ItemRow
  }
  return writeApproved(item, owner, by, null, 'approve_internal_final')
}

// ── Client bundle (§3, §5) ─────────────────────────────────────────────────

export async function sendBundle(owner: ContentOwnerRef, by: string | null): Promise<{ bundle_id: string; token: string; item_count: number }> {
  const { column, value } = ownerColumn(owner)
  const { data: items } = await supabaseAdmin.from('copy_library_items').select('id, asset_key').eq(column, value).eq('status', 'in_internal_review')
  if (!items?.length) throw new CopyError('No items are waiting for client approval. Approve items internally first.', 409)
  const token = randomBytes(24).toString('base64url')
  const { data: b, error } = await supabaseAdmin.from('copy_library_bundles').insert({ ...ownerInsertColumns(owner), item_ids: items.map(i => i.id), review_token: token, sent_by: actor(by) }).select('id').single()
  if (error) throw new CopyError(error.message, 500)
  await supabaseAdmin.from('copy_library_items').update({ status: 'pending_client', client_bundle_id: b.id }).in('id', items.map(i => i.id))
  await logCopyChange({ item_id: null, owner, asset_key: null, action: 'send_bundle', before: null, after: { bundle_id: b.id, items: items.map(i => i.asset_key) }, by })
  return { bundle_id: b.id, token, item_count: items.length }
}

export async function decideBundle(token: string, decision: 'approved' | 'changes_requested', comment: string | null): Promise<{ approved: number }> {
  const { data: b } = await supabaseAdmin.from('copy_library_bundles').select('*').eq('review_token', token).maybeSingle()
  if (!b) throw new CopyError('This review link is not valid.', 404)
  if (b.status !== 'sent') throw new CopyError('A decision has already been recorded for this link.', 409)
  if (decision === 'changes_requested' && !(comment ?? '').trim()) throw new CopyError('Please say what should change.', 400)
  const owner: ContentOwnerRef = b.event_id ? { kind: 'event', id: b.event_id } : b.umbrella_id ? { kind: 'umbrella', id: b.umbrella_id } : { kind: 'org', id: 'trescon' }
  const { data: items } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).in('id', b.item_ids as string[])
  let approved = 0
  if (decision === 'approved') {
    for (const it of (items ?? []) as ItemRow[]) {
      if (it.status !== 'pending_client' || it.client_bundle_id !== b.id) continue // changed since it was sent: not part of this approval
      await writeApproved(it, owner, null, b.id, 'client_approved'); approved++
    }
  } else {
    await supabaseAdmin.from('copy_library_items').update({ status: 'in_internal_review', client_bundle_id: null }).eq('client_bundle_id', b.id).eq('status', 'pending_client')
  }
  await supabaseAdmin.from('copy_library_bundles').update({ status: decision, decided_at: new Date().toISOString(), client_comment: comment?.trim() || null }).eq('id', b.id)
  await logCopyChange({ item_id: null, owner, asset_key: null, action: decision === 'approved' ? 'bundle_approved' : 'bundle_changes_requested', before: { status: 'sent' }, after: { bundle_id: b.id, approved, comment: comment ?? null }, by: null })
  return { approved }
}

export async function loadBundleForClient(token: string) {
  const { data: b } = await supabaseAdmin.from('copy_library_bundles').select('*').eq('review_token', token).maybeSingle()
  if (!b) return null
  const { data: items } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).in('id', b.item_ids as string[])
  let name: string | null = null
  if (b.event_id) { const { data: e } = await supabaseAdmin.from('events').select('name, public_name').eq('id', b.event_id).maybeSingle(); name = e?.public_name || e?.name || null }
  else if (b.umbrella_id) { const { data: u } = await supabaseAdmin.from('event_umbrellas').select('name').eq('id', b.umbrella_id).maybeSingle(); name = u?.name ?? null }
  const order = new Map(COPY_CATALOGUE.map((e, i) => [e.key, i]))
  const rows = ((items ?? []) as ItemRow[]).sort((a, c) => (order.get(a.asset_key) ?? 99) - (order.get(c.asset_key) ?? 99))
  return {
    status: b.status as string, sent_at: b.sent_at as string, decided_at: b.decided_at as string | null, client_comment: b.client_comment as string | null, owner_name: name,
    items: rows.map(i => ({ id: i.id, label: CATALOGUE_BY_KEY.get(i.asset_key)?.label ?? i.asset_key, length: i.variant_length, phase: i.variant_phase, text: i.working_text })),
  }
}

// ── Phase (§3) ──────────────────────────────────────────────────────────────

export async function setContentPhase(eventId: string, phase: 'pre' | 'post', by: string | null): Promise<void> {
  const { data: before } = await supabaseAdmin.from('events').select('content_phase').eq('id', eventId).maybeSingle()
  if (!before) throw new CopyError('Event not found.', 404)
  if (before.content_phase === phase) return
  const { error } = await supabaseAdmin.from('events').update({ content_phase: phase }).eq('id', eventId)
  if (error) throw new CopyError(error.message, 500)
  await logCopyChange({ item_id: null, owner: { kind: 'event', id: eventId }, asset_key: null, action: 'set_phase', before: { content_phase: before.content_phase }, after: { content_phase: phase }, by })
}

// ── Review cycle (§5) ───────────────────────────────────────────────────────

async function currentSectionsFor(owner: ContentOwnerRef): Promise<Section[]> {
  return (await messagingSections(owner)).sections.filter(s => s.role === 'messaging')
}
/** Find where a section lives now: same id first, then same title (a new live version has a new doc id). */
function matchSection(ref: DocSourceRef, current: Section[]): Section | null {
  return current.find(s => s.id === ref.section_id) ?? (ref.section_title ? current.find(s => s.title === ref.section_title) : undefined) ?? null
}

const snapshots = (refs: DocSourceRef[], current: Section[]) => refs.map(r => { const m = matchSection(r, current); return m ? { doc_id: m.doc_id, section_id: m.id, content: m.text } : null })

/** Runs after a messaging document changes (new live version or a section edit). Compares each item's source section hashes with the document now.
    Changed → needs_review with a readable reason. House-style changes never reach here (§2.4): only messaging-document sections are compared.
    Consumers keep reading approved_text (§2.3). Best effort; never throws into the caller. */
export async function runCopyReviewCycle(owner: ContentOwnerRef): Promise<{ flagged: number }> {
  try {
    const targets: ContentOwnerRef[] = owner.kind === 'umbrella'
      ? [owner, ...((await supabaseAdmin.from('events').select('id').eq('umbrella_id', owner.id)).data ?? []).map(e => ({ kind: 'event' as const, id: e.id as string }))]
      : [owner]
    let flagged = 0
    for (const t of targets) {
      if (t.kind === 'org') continue
      const { column, value } = ownerColumn(t)
      const { data } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).eq(column, value).neq('status', 'needs_review')
      const items = ((data ?? []) as ItemRow[]).filter(i => docRefs(i.source_refs).length)
      if (!items.length) continue
      const current = await currentSectionsFor(t)
      for (const it of items) {
        const f = reviewFinding(docRefs(it.source_refs), snapshots(docRefs(it.source_refs), current), it.working_text)
        if (!f.changed) continue
        await supabaseAdmin.from('copy_library_items').update({ status: 'needs_review', review_reason: f.reason, updated_at: new Date().toISOString() }).eq('id', it.id)
        await logCopyChange({ item_id: it.id, owner: t, asset_key: it.asset_key, action: 'flag_needs_review', before: { status: it.status }, after: { status: 'needs_review', review_reason: f.reason }, by: null })
        flagged++
      }
    }
    return { flagged }
  } catch (e) { console.error('[copy-library] review cycle failed:', e instanceof Error ? e.message : e); return { flagged: 0 } }
}

// ── Public figures (public-figures.md §7, Step 0 outcome) ───────────────────

/** A figure got a new approved version: every Copy Library item built from it goes to needs_review with a readable reason ("Footfall: '6,500+' → '6,800+'"),
    keeps serving its last approved text, and offers Regenerate. Items that do not reference this figure are untouched. */
export async function flagItemsForFigure(eventId: string, figureId: string, by: string | null): Promise<number> {
  const { data } = await supabaseAdmin.from('copy_library_items').select(ITEM_COLS).eq('event_id', eventId).neq('status', 'needs_review')
  let flagged = 0
  for (const it of ((data ?? []) as ItemRow[]).filter(i => figureRefs(i.source_refs).some(r => r.figure_id === figureId))) {
    const f = await figureRefChanges(figureRefs(it.source_refs))
    if (!f.changed) continue
    await supabaseAdmin.from('copy_library_items').update({ status: 'needs_review', review_reason: f.reason, updated_at: new Date().toISOString() }).eq('id', it.id)
    await logCopyChange({ item_id: it.id, owner: { kind: 'event', id: eventId }, asset_key: it.asset_key, action: 'flag_needs_review', before: { status: it.status }, after: { status: 'needs_review', review_reason: f.reason, public_figure: figureId }, by })
    flagged++
  }
  return flagged
}

/** The approved figures a post-event key-figures block may be built from: the headline numbers, the programme and the outcomes. */
const BLOCK_CATEGORIES = ['at_a_glance', 'programme', 'outcomes']
async function figuresForBlock(eventId: string): Promise<PublicFigure[]> {
  return (await getPublicFigures(eventId, { categories: BLOCK_CATEGORIES, phase: 'post' })).filter(f => f.kind !== 'breakdown')
}
const figureLine = (f: PublicFigure) => `- ${f.group_label ? `${f.group_label}: ` : ''}${f.label}: ${f.kind === 'outcome' ? (f.payload.text ?? '') : (f.payload.display ?? '')}`

/** Context for generation that does not read the messaging document: only the event facts and the style notes. */
async function lightContext(owner: ContentOwnerRef): Promise<GenContext> {
  const [notes, facts, rules, nl] = await Promise.all([getEffectiveStyleNotes(owner).catch(() => []), ownerFacts(owner), resolveEffectiveRulesForOwner(owner, 'any').catch(() => [] as ValidationRule[]), eventNameAndLinks(owner)])
  return { messaging: [], docBlock: '', noteBlock: notes.length ? `STYLE NOTES (writing guidance):\n${notes.map(n => `- ${n.note}`).join('\n')}` : '', facts, figures: NO_FIGURES, rules, eventName: nl.eventName, links: nl.links }
}

/** After-the-event key figures, grounded ONLY on the event's approved public figures. The model may not reword, round or add a number: every number in the
    text must already appear in the approved values (checked, one retry). The refs point at the figures and their versions, so a later re-approval flags the item. */
async function draftFromFigures(ctx: GenContext, entry: typeof COPY_CATALOGUE[number], wanted: Array<{ length: VariantLength; phase: VariantPhase }>, figs: PublicFigure[]): Promise<Draft[]> {
  const list = figs.map(figureLine).join('\n')
  const allowed = `${list}\n${ctx.facts}`
  const refs: SourceRef[] = figs.map(f => ({ type: 'public_figure', figure_id: f.id, version: f.version }))
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const variantSpec = wanted.map((v, i) => `${i + 1}. length="${v.length}" phase="${v.phase}"${entry.wordTarget?.[v.length] ? ` — ${entry.wordTarget[v.length]}` : ''}`).join('\n')
    const prompt = `You write ready-to-use event copy for Trescon, an event organiser. You are building one reusable "${entry.label}" item from the event's APPROVED PUBLIC FIGURES.

EVENT FACTS
${ctx.facts}

APPROVED PUBLIC FIGURES (the only numbers you may use, exactly as written)
${list}

${ctx.noteBlock}

TASK
${entry.guidance}

Write these variants:
${variantSpec}

HARD RULES
- Use each figure EXACTLY as written above: do not round it, convert it, reword it, add to it or combine two figures into one. Do not use any number that is not written above.
- Past tense: the event has concluded.
- Never use the word "target" or "targets".
- Do not use em dashes. Plain, specific language; no filler such as "excited to announce".
- Return JSON only: {"variants":[{"length":"...","phase":"...","text":"..."}]}.${feedback ? `\n\nFIX THESE PROBLEMS FROM YOUR LAST ATTEMPT\n${feedback}` : ''}`
    const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
    const raw = await generateCopy(model, prompt, `copy-library:${entry.key}:figures`)
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as { variants?: Array<{ length: string; phase: string; text: string }> }
    const drafts: Draft[] = []
    for (const v of wanted) {
      const got = parsed.variants?.find(x => x.length === v.length && x.phase === v.phase)
      if (got && typeof got.text === 'string' && got.text.trim()) drafts.push({ length: v.length, phase: v.phase, text: got.text.trim(), refs })
    }
    const problems = [
      ...lengthViolations(drafts),
      ...drafts.flatMap(d => { const bad = unsupportedNumbers(d.text, allowed); return bad.length ? [`The ${d.length} text uses ${bad.join(', ')}, which is not one of the approved figures.`] : [] }),
      ...drafts.flatMap(d => forbiddenHits(d.text, entry.forbidden).map(w => `The ${d.length} text uses the word "${w}".`)),
    ]
    if (!problems.length && drafts.length === wanted.length) return drafts
    if (attempt === 1) throw new Error(problems.join(' ') || 'The model returned no usable text.')
    feedback = problems.join('\n') || 'Return every requested variant.'
  }
  return []
}

export { isValidVariant, starterVariants }

/** For each item: the numbers in its text that are not approved figures of its phase (or the event facts). Read-time, so it also covers old items and hand edits. Quotes and fixed lines are never checked. */
export async function statWarningsFor(owner: ContentOwnerRef, items: Array<{ asset_key: string; variant_phase: string; working_text: string }>): Promise<string[][]> {
  if (owner.kind !== 'event') return items.map(() => [])
  const [figures, facts] = await Promise.all([loadFigures(owner), ownerFacts(owner)])
  return items.map(i => {
    if (NO_STAT_CHECK.has(i.asset_key) || !i.working_text?.trim() || isNotUsed(i.working_text)) return []
    return unapprovedNumbers(i.working_text, figuresForItem(i.asset_key, i.variant_phase as 'pre' | 'post' | 'any', figures), facts)
  })
}

/** How many approved figures each phase has: the Copy Library says so when a phase has none (its copy is then generated without statistics). */
export async function approvedFigureCounts(owner: ContentOwnerRef): Promise<{ pre: number; post: number }> {
  const f = await loadFigures(owner)
  return { pre: f.pre.length, post: f.post.length }
}

