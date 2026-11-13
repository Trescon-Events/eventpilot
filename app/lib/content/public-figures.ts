import { supabaseAdmin } from '@/app/lib/supabase'
import type { ContentOwnerRef } from './owner'
import { clientApprovalRequired } from './copy-model'
import { findingsFor, flagItemsForFigure } from './copy-library'
import type { ValidationFinding } from './validate'
import { FIGURE_CATALOGUE, FIGURE_CATALOGUE_BY_KEY, entriesForCategory, type FigureKind } from './public-figures-catalogue'
import {
  breakdownSumWarning, figureChangePairs, finalRoute, isFilled, normalizePayload, samePayload, statusAfterFigureEdit, textsToCheck, type DecisionKind, type FigurePayload, type FigureStatus,
} from './public-figures-model'

/* Public figures, write side (docs/build_suggestions/public-figures.md §4–§6). Every write is audited (§3.5). Tools read ONLY through public-figures-read.ts (approved_payload
   of an active item). Approved = locked: changing one needs Reopen with a reason, which leaves the old approved version in force until the new one is approved (§3.3). */

export class FigureError extends Error { constructor(msg: string, public status = 400, public extra?: Record<string, unknown>) { super(msg) } }

export type FigureRow = {
  id: string; event_id: string; kind: FigureKind; catalogue_key: string | null; category: string; group_label: string | null; label: string
  working_payload: FigurePayload; approved_payload: FigurePayload | null; approved_label: string | null; approved_version: number; status: FigureStatus
  source: string | null; evidence_file_path: string | null; evidence_file_name: string | null; basis: 'measured' | 'estimate'; owner_id: string | null; notes: string | null
  sort_order: number; is_active: boolean; approved_by: string | null; approved_at: string | null; created_at: string; updated_at: string
}
export const FIGURE_COLS = 'id, event_id, kind, catalogue_key, category, group_label, label, working_payload, approved_payload, approved_label, approved_version, status, source, evidence_file_path, evidence_file_name, basis, owner_id, notes, sort_order, is_active, approved_by, approved_at, created_at, updated_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actor = (id: string | null) => (id && UUID.test(id) ? id : null)
const eventOwner = (eventId: string): ContentOwnerRef => ({ kind: 'event', id: eventId })

export async function logFigureChange(e: { event_id: string; figure_id: string | null; action: string; before?: unknown; after?: unknown; reason?: string | null; by: string | null }): Promise<void> {
  const { error } = await supabaseAdmin.from('event_public_figure_changes').insert({ event_id: e.event_id, figure_id: e.figure_id, action: e.action, before: e.before ?? null, after: e.after ?? null, reason: e.reason ?? null, changed_by: actor(e.by) })
  if (error) throw new Error(`Could not record the public figures change: ${error.message}`)
}

export async function loadFigure(id: string): Promise<FigureRow> {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('id', id).maybeSingle()
  if (!data) throw new FigureError('Item not found.', 404)
  return data as FigureRow
}
export async function eventOfFigure(id: string): Promise<string> { return (await loadFigure(id)).event_id }

export async function requiresClientApproval(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('events').select('type, copy_requires_client_approval').eq('id', eventId).maybeSingle()
  return clientApprovalRequired(data?.copy_requires_client_approval, data?.type)
}

// ── Checking (§6.1) ─────────────────────────────────────────────────────────

export type ItemCheck = { errors: ValidationFinding[]; warnings: Array<{ message: string; match?: string }> }

/** Event-rule findings on every piece of wording (errors block submission, warnings do not) plus the breakdown sum warning. */
export async function checkItems(eventId: string, items: Array<{ id: string; kind: FigureKind; label: string; working_payload: FigurePayload }>): Promise<Map<string, ItemCheck>> {
  const texts = items.map(i => textsToCheck(i.kind, i.label, i.working_payload))
  const flat = texts.flat()
  const found = flat.length ? await findingsFor(eventOwner(eventId), flat) : []
  const out = new Map<string, ItemCheck>(); let at = 0
  items.forEach((i, idx) => {
    const mine = found.slice(at, at + texts[idx].length).flat(); at += texts[idx].length
    const sum = i.kind === 'breakdown' ? breakdownSumWarning(i.working_payload) : null
    out.set(i.id, { errors: mine.filter(f => f.severity === 'error'), warnings: [...mine.filter(f => f.severity !== 'error'), ...(sum ? [{ message: sum }] : [])] })
  })
  return out
}

// ── Listing ─────────────────────────────────────────────────────────────────

export type Feedback = {
  id: string; reviewer_id: string | null; reviewer_name: string; decision: DecisionKind; suggested_label: string | null; suggested_payload: FigurePayload | null; comment: string | null
  seen_label: string | null; seen_payload: FigurePayload | null; decided_at: string; resolved_at: string | null
}
export type ItemRound = { round_id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; closed_at: string | null; answers: Feedback[]; waiting: string[] }
export type RoundSummary = {
  id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; sent_at: string; closed_at: string | null; items: number
  reviewers: Array<{ id: string; name: string; email: string; kind: 'staff' | 'client'; done: boolean; answered: number; last_opened_at: string | null; notified_at: string | null }>
}

export async function listFigures(eventId: string) {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true).order('sort_order').order('label')
  const rows = (data ?? []) as FigureRow[]
  const ids = rows.map(r => r.id)
  const [checks, usagesRes, requires, roundsRes, approversRes] = await Promise.all([
    checkItems(eventId, rows.map(r => ({ id: r.id, kind: r.kind, label: r.label, working_payload: r.working_payload }))),
    ids.length ? supabaseAdmin.from('event_public_figure_usages').select('figure_id, version, mode, consumer_type').in('figure_id', ids) : Promise.resolve({ data: [] }),
    requiresClientApproval(eventId),
    supabaseAdmin.from('event_public_figure_reviews').select('id, audience, status, sent_at, closed_at, item_ids, event_public_figure_reviewers(id, name, email, kind, done_at, last_opened_at, notified_at)').eq('event_id', eventId).order('sent_at', { ascending: false }),
    supabaseAdmin.from('event_public_figure_approvers').select('id, name, email').eq('event_id', eventId).order('created_at'),
  ])
  type RoundRowDb = { id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; sent_at: string; closed_at: string | null; item_ids: string[]; event_public_figure_reviewers: Array<{ id: string; name: string; email: string; kind: 'staff' | 'client'; done_at: string | null; last_opened_at: string | null; notified_at: string | null }> }
  const rounds = (roundsRes.data ?? []) as unknown as RoundRowDb[]
  const roundIds = rounds.map(r => r.id)
  const { data: decs } = roundIds.length
    ? await supabaseAdmin.from('event_public_figure_decisions').select('id, review_id, figure_id, reviewer_id, decision, suggested_label, suggested_payload, comment, seen_label, seen_payload, decided_at, resolved_at').in('review_id', roundIds).order('decided_at')
    : { data: [] }
  const decisions = (decs ?? []) as Array<{ id: string; review_id: string; figure_id: string; reviewer_id: string | null } & Omit<Feedback, 'id' | 'reviewer_id' | 'reviewer_name'>>
  const nameOf = new Map<string, string>(); for (const r of rounds) for (const v of r.event_public_figure_reviewers ?? []) nameOf.set(v.id, v.name)

  // for every item: the latest internal round and the latest client round that included it, with each reviewer's answer (and who has not answered)
  const rounds_by_item = new Map<string, ItemRound[]>()
  for (const f of rows) {
    const out: ItemRound[] = []
    for (const audience of ['internal', 'client'] as const) {
      const rv = rounds.find(r => r.audience === audience && (r.item_ids ?? []).includes(f.id))
      if (!rv) continue
      const answers = decisions.filter(d => d.review_id === rv.id && d.figure_id === f.id).map(d => ({ ...d, reviewer_name: d.reviewer_id ? (nameOf.get(d.reviewer_id) ?? 'Reviewer') : 'Reviewer' }))
      const waiting = (rv.event_public_figure_reviewers ?? []).filter(v => !answers.some(a => a.reviewer_id === v.id)).map(v => v.name)
      out.push({ round_id: rv.id, audience, status: rv.status, closed_at: rv.closed_at, answers, waiting })
    }
    rounds_by_item.set(f.id, out)
  }

  const alerts = new Map<string, number>()
  for (const u of (usagesRes.data ?? []) as Array<{ figure_id: string; version: number; mode: string }>) {
    const fig = rows.find(r => r.id === u.figure_id)
    if (fig && u.mode === 'live' && u.version < fig.approved_version) alerts.set(u.figure_id, (alerts.get(u.figure_id) ?? 0) + 1)
  }
  const usageCount = new Map<string, number>()
  for (const u of (usagesRes.data ?? []) as Array<{ figure_id: string }>) usageCount.set(u.figure_id, (usageCount.get(u.figure_id) ?? 0) + 1)

  const summarise = (rv: RoundRowDb): RoundSummary => ({
    id: rv.id, audience: rv.audience, status: rv.status, sent_at: rv.sent_at, closed_at: rv.closed_at, items: (rv.item_ids ?? []).length,
    reviewers: (rv.event_public_figure_reviewers ?? []).map(v => ({ id: v.id, name: v.name, email: v.email, kind: v.kind, done: !!v.done_at, answered: decisions.filter(d => d.review_id === rv.id && d.reviewer_id === v.id).length, last_opened_at: v.last_opened_at, notified_at: v.notified_at })),
  })
  return {
    requires_client_approval: requires,
    approvers: (approversRes.data ?? []) as Array<{ id: string; name: string; email: string }>,
    rounds: { internal: rounds.filter(r => r.audience === 'internal').slice(0, 1).map(summarise)[0] ?? null, client: rounds.filter(r => r.audience === 'client').slice(0, 1).map(summarise)[0] ?? null },
    items: rows.map(r => ({ ...r, errors: checks.get(r.id)?.errors ?? [], warnings: checks.get(r.id)?.warnings ?? [], feedback: rounds_by_item.get(r.id) ?? [], update_available: alerts.get(r.id) ?? 0, usage_count: usageCount.get(r.id) ?? 0 })),
  }
}

// ── Building the set (§5) ───────────────────────────────────────────────────

const emptyPayload = (kind: FigureKind, label: string): FigurePayload => (kind === 'figure' ? { display: '' } : kind === 'outcome' ? { text: '' } : { title: label, rows: [] })

async function nextSort(eventId: string): Promise<number> {
  const { data } = await supabaseAdmin.from('event_public_figures').select('sort_order').eq('event_id', eventId).order('sort_order', { ascending: false }).limit(1)
  return ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1
}

async function insertFigures(eventId: string, rows: Array<{ kind: FigureKind; catalogue_key: string | null; category: string; group_label: string | null; label: string; basis?: 'measured' | 'estimate' }>, by: string | null, action: string): Promise<FigureRow[]> {
  if (!rows.length) return []
  let sort = await nextSort(eventId)
  const { data, error } = await supabaseAdmin.from('event_public_figures').insert(rows.map(r => ({
    event_id: eventId, kind: r.kind, catalogue_key: r.catalogue_key, category: r.category, group_label: r.group_label, label: r.label, working_payload: emptyPayload(r.kind, r.label),
    basis: r.basis ?? 'measured', owner_id: actor(by), sort_order: sort++, created_by: actor(by),
  }))).select(FIGURE_COLS)
  if (error) throw new FigureError(error.message.includes('uq_event_public_figures_label') ? 'An item with that name already exists in this group.' : error.message, error.message.includes('uq_') ? 409 : 500)
  await logFigureChange({ event_id: eventId, figure_id: null, action, after: { count: data.length, labels: data.map(d => d.label) }, by })
  return (data ?? []) as FigureRow[]
}

/** Only when the event has no items yet. Every catalogue entry, as an empty draft (§5). */
export async function startFromTemplate(eventId: string, by: string | null): Promise<{ created: number }> {
  const { count } = await supabaseAdmin.from('event_public_figures').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('is_active', true)
  if (count) throw new FigureError('This event already has items. Use “Add from catalogue” to add single entries.', 409)
  const rows = await insertFigures(eventId, FIGURE_CATALOGUE.map(e => ({ kind: e.kind, catalogue_key: e.key, category: e.category, group_label: null, label: e.label, basis: e.basis })), by, 'start_from_template')
  return { created: rows.length }
}

export async function addFromCatalogue(eventId: string, key: string, groupLabel: string | null, by: string | null): Promise<FigureRow> {
  const e = FIGURE_CATALOGUE_BY_KEY.get(key)
  if (!e) throw new FigureError('Unknown catalogue entry.', 400)
  const [row] = await insertFigures(eventId, [{ kind: e.kind, catalogue_key: e.key, category: e.category, group_label: groupLabel?.trim() || null, label: e.label, basis: e.basis }], by, 'add_from_catalogue')
  return row
}

export async function addCustom(eventId: string, input: { kind: FigureKind; category: string; label: string; group_label?: string | null }, by: string | null): Promise<FigureRow> {
  const label = input.label.replace(/\s+/g, ' ').trim()
  if (!label) throw new FigureError('Give the item a name.', 400)
  if (!['figure', 'breakdown', 'outcome'].includes(input.kind)) throw new FigureError('Choose figure, breakdown or outcome.', 400)
  const [row] = await insertFigures(eventId, [{ kind: input.kind, catalogue_key: null, category: input.category.trim() || 'custom', group_label: input.group_label?.trim() || null, label }], by, 'add_custom')
  return row
}

/** "Add group": copies a category's catalogue entries under a new group label (a second competition, one more channel). */
export async function addGroup(eventId: string, category: string, groupLabel: string, by: string | null): Promise<{ created: number }> {
  const g = groupLabel.replace(/\s+/g, ' ').trim()
  const entries = entriesForCategory(category)
  if (!g || !entries.length) throw new FigureError('Choose a category and a group name.', 400)
  const rows = await insertFigures(eventId, entries.map(e => ({ kind: e.kind, catalogue_key: e.key, category: e.category, group_label: g, label: e.label, basis: e.basis })), by, 'add_group')
  return { created: rows.length }
}

/** Bulk "remove all empty": removes (keeps for audit) every item that was never filled in and never approved. */
export async function removeAllEmpty(eventId: string, by: string | null): Promise<{ removed: number }> {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true).eq('approved_version', 0)
  const empty = ((data ?? []) as FigureRow[]).filter(r => !isFilled(r.kind, r.working_payload) && ['draft'].includes(r.status))
  if (!empty.length) return { removed: 0 }
  const { error } = await supabaseAdmin.from('event_public_figures').update({ is_active: false, updated_at: new Date().toISOString() }).in('id', empty.map(r => r.id))
  if (error) throw new FigureError(error.message, 500)
  await logFigureChange({ event_id: eventId, figure_id: null, action: 'remove_all_empty', before: { count: empty.length, labels: empty.map(r => r.label) }, by })
  return { removed: empty.length }
}

export async function removeItem(id: string, by: string | null): Promise<void> {
  const f = await loadFigure(id)
  if (f.status === 'pending_client') throw new FigureError('This item is with the client. Wait for the decision first.', 409)
  const { error } = await supabaseAdmin.from('event_public_figures').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new FigureError(error.message, 500)
  await logFigureChange({ event_id: f.event_id, figure_id: id, action: 'remove', before: { label: f.label, status: f.status, approved_version: f.approved_version }, by })
}

export type FigurePatch = { label?: string; payload?: unknown; source?: string | null; basis?: string; notes?: string | null; owner_id?: string | null; group_label?: string | null }

export async function updateItem(id: string, patch: FigurePatch, by: string | null): Promise<FigureRow> {
  const f = await loadFigure(id)
  const wording = patch.label !== undefined || patch.payload !== undefined || patch.group_label !== undefined
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (wording) {
    const status = statusAfterFigureEdit(f.status, f.approved_version > 0)
    if (!status) throw new FigureError(f.status === 'approved' ? 'This item is approved and locked. Reopen it (with a reason) to change it.' : 'This item is with the client. Wait for the decision first.', 409)
    if (patch.label !== undefined) { const l = patch.label.replace(/\s+/g, ' ').trim(); if (!l) throw new FigureError('The name cannot be empty.', 400); next.label = l }
    if (patch.payload !== undefined) next.working_payload = normalizePayload(f.kind, patch.payload)
    if (patch.group_label !== undefined) next.group_label = patch.group_label?.trim() || null
    next.status = status
  }
  if (patch.source !== undefined) next.source = patch.source?.trim() || null
  if (patch.basis !== undefined) { if (patch.basis !== 'measured' && patch.basis !== 'estimate') throw new FigureError('Basis is measured or estimate.', 400); next.basis = patch.basis }
  if (patch.notes !== undefined) next.notes = patch.notes?.trim() || null
  if (patch.owner_id !== undefined) next.owner_id = actor(patch.owner_id ?? null)
  const { data, error } = await supabaseAdmin.from('event_public_figures').update(next).eq('id', id).select(FIGURE_COLS).single()
  if (error) throw new FigureError(error.message.includes('uq_event_public_figures_label') ? 'An item with that name already exists in this group.' : error.message, error.message.includes('uq_') ? 409 : 500)
  await logFigureChange({ event_id: f.event_id, figure_id: id, action: wording ? 'edit' : 'edit_details', before: { label: f.label, working_payload: f.working_payload, status: f.status, source: f.source, basis: f.basis }, after: { label: data.label, working_payload: data.working_payload, status: data.status, source: data.source, basis: data.basis }, by })
  return data as FigureRow
}

export async function setEvidence(id: string, path: string | null, name: string | null, by: string | null): Promise<void> {
  const f = await loadFigure(id)
  const { error } = await supabaseAdmin.from('event_public_figures').update({ evidence_file_path: path, evidence_file_name: name, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new FigureError(error.message, 500)
  await logFigureChange({ event_id: f.event_id, figure_id: id, action: path ? 'attach_evidence' : 'remove_evidence', before: { path: f.evidence_file_path }, after: { path }, by })
}

// ── Approval (§6.2, §6.4) ───────────────────────────────────────────────────

type Route = 'internal' | 'client' | 'client_suggestion_accepted'

/** The one place an approved version is made. Locks the item, records the version, and tells the Copy Library when an existing figure changed. */
export async function writeApproved(f: FigureRow, payload: FigurePayload, label: string, route: Route, by: string | null): Promise<FigureRow> {
  const version = f.approved_version + 1
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('event_public_figures').update({
    approved_payload: payload, approved_label: label, approved_version: version, working_payload: payload, label, status: 'approved', approved_by: actor(by), approved_at: now, updated_at: now,
  }).eq('id', f.id).select(FIGURE_COLS).single()
  if (error) throw new FigureError(error.message.includes('uq_event_public_figures_label') ? 'An item with that name already exists in this group.' : error.message, 500)
  const v = await supabaseAdmin.from('event_public_figure_versions').insert({ figure_id: f.id, version, label, payload, approved_by: actor(by), approved_at: now, approval_route: route })
  if (v.error) throw new FigureError(`Approved, but the version record failed: ${v.error.message}`, 500)
  await logFigureChange({ event_id: f.event_id, figure_id: f.id, action: `approve_${route}`, before: { status: f.status, approved_version: f.approved_version, approved_payload: f.approved_payload }, after: { status: 'approved', approved_version: version, approved_payload: payload, label }, by })
  if (version > 1) await flagItemsForFigure(f.event_id, f.id, by).catch(e => console.error('[public-figures] copy library flag failed:', e instanceof Error ? e.message : e))
  return data as FigureRow
}

/** Internal approval of one item: with client approval required it moves to "in_internal_review" (ready for the client round), otherwise it is approved. */
async function internalApprove(f: FigureRow, requires: boolean, by: string | null): Promise<FigureRow> {
  if (!requires) return writeApproved(f, f.working_payload, f.label, 'internal', by)
  const { data, error } = await supabaseAdmin.from('event_public_figures').update({ status: 'in_internal_review', updated_at: new Date().toISOString() }).eq('id', f.id).select(FIGURE_COLS).single()
  if (error) throw new FigureError(error.message, 500)
  await logFigureChange({ event_id: f.event_id, figure_id: f.id, action: 'approve_internal', before: { status: f.status }, after: { status: 'in_internal_review' }, by })
  return data as FigureRow
}

const APPROVABLE: FigureStatus[] = ['draft', 'edited_since_approval', 'client_rejected', 'client_suggested']

export async function approveInternally(eventId: string, ids: string[] | 'all', by: string | null): Promise<{ approved: number; moved_to_client: number; blocked: Array<{ id: string; label: string; reason: string }> }> {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true)
  let rows = ((data ?? []) as FigureRow[]).filter(r => APPROVABLE.includes(r.status) && isFilled(r.kind, r.working_payload))
  if (ids !== 'all') rows = rows.filter(r => ids.includes(r.id))
  const requires = await requiresClientApproval(eventId)
  const checks = await checkItems(eventId, rows)
  let approved = 0, toClient = 0
  const blocked: Array<{ id: string; label: string; reason: string }> = []
  for (const r of rows) {
    const c = checks.get(r.id)
    if (c?.errors.length) { blocked.push({ id: r.id, label: r.label, reason: c.errors[0].message }); continue }
    const out = await internalApprove(r, requires, by)
    if (out.status === 'approved') approved++; else toClient++
  }
  return { approved, moved_to_client: toClient, blocked }
}

// ── Acting on feedback (the producer decides) ────────────────────────────────

async function resolveFigureDecisions(figureId: string): Promise<void> {
  await supabaseAdmin.from('event_public_figure_decisions').update({ resolved_at: new Date().toISOString() }).eq('figure_id', figureId).is('resolved_at', null)
}

/** Use one reviewer's suggestion. From the client (round closed): approved exactly as suggested, no second round. From a colleague: it only fills in the working copy, which the producer then approves. */
export async function acceptSuggestion(id: string, decisionId: string, by: string | null): Promise<FigureRow> {
  const f = await loadFigure(id)
  const { data: d } = await supabaseAdmin.from('event_public_figure_decisions').select('id, figure_id, decision, suggested_label, suggested_payload, event_public_figure_reviews!inner(audience, status)').eq('id', decisionId).eq('figure_id', id).maybeSingle()
  const rv = (d as unknown as { event_public_figure_reviews: { audience: 'internal' | 'client'; status: string } } | null)?.event_public_figure_reviews
  if (!d || !rv || d.decision !== 'suggest' || !d.suggested_payload) throw new FigureError('There is no suggestion to accept on this item.', 409)
  const payload = normalizePayload(f.kind, d.suggested_payload)
  const label = (d.suggested_label as string | null) || f.label
  const c = (await checkItems(f.event_id, [{ id, kind: f.kind, label, working_payload: payload }])).get(id)
  if (c?.errors.length) throw new FigureError(`The suggestion breaks the event’s rules (${c.errors[0].message}). Counter it with your own wording instead.`, 409, { findings: c.errors })
  let out: FigureRow
  if (rv.audience === 'client') {
    if (rv.status !== 'closed') throw new FigureError('Close the client round first.', 409)
    if (f.status !== 'client_suggested') throw new FigureError('There is no suggestion to accept on this item.', 409)
    out = await writeApproved(f, payload, label, 'client_suggestion_accepted', by)
  } else {
    out = await updateItem(id, { label, payload }, by)
  }
  await supabaseAdmin.from('event_public_figure_decisions').update({ resolved_at: new Date().toISOString() }).eq('id', decisionId)
  return out
}

/** Counter a suggestion, or revise a rejected item: the producer's own wording. With client approval required it is ready for the next client round. */
export async function reviseAndResend(id: string, patch: { label?: string; payload?: unknown }, by: string | null): Promise<FigureRow> {
  const f = await loadFigure(id)
  if (f.status !== 'client_suggested' && f.status !== 'client_rejected') throw new FigureError('Only an item with a suggestion or a rejection can be revised here.', 409)
  const label = patch.label !== undefined ? patch.label.replace(/\s+/g, ' ').trim() : f.label
  const payload = patch.payload !== undefined ? normalizePayload(f.kind, patch.payload) : f.working_payload
  if (!label || !isFilled(f.kind, payload)) throw new FigureError('Fill in the wording first.', 400)
  const c = (await checkItems(f.event_id, [{ id, kind: f.kind, label, working_payload: payload }])).get(id)
  if (c?.errors.length) throw new FigureError(`This breaks the event’s rules: ${c.errors[0].message}`, 409, { findings: c.errors })
  const requires = await requiresClientApproval(f.event_id)
  const status: FigureStatus = requires ? 'in_internal_review' : f.approved_version > 0 ? 'edited_since_approval' : 'draft'
  const { data, error } = await supabaseAdmin.from('event_public_figures').update({ label, working_payload: payload, status, updated_at: new Date().toISOString() }).eq('id', id).select(FIGURE_COLS).single()
  if (error) throw new FigureError(error.message.includes('uq_') ? 'An item with that name already exists in this group.' : error.message, 500)
  await logFigureChange({ event_id: f.event_id, figure_id: id, action: 'revise_after_review', before: { label: f.label, working_payload: f.working_payload, status: f.status }, after: { label, working_payload: payload, status }, by })
  await resolveFigureDecisions(id)
  return data as FigureRow
}

/** Remove an item the reviewers rejected from the public set (kept for the audit trail). */
export async function removeAfterReview(id: string, by: string | null): Promise<void> {
  await removeItem(id, by)
  await resolveFigureDecisions(id)
}

/** The producer's final approval after the client round. The route is 'client' only when a client approver approved exactly the wording being approved; otherwise it is the
    producer's own decision and, when the event needs the client, they must say so (override). Items the client has never seen are blocked. */
export async function finalApprove(eventId: string, ids: string[], override: boolean, by: string | null): Promise<{ approved: number; blocked: Array<{ id: string; label: string; reason: string; needs_override?: boolean }> }> {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true).in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const rows = ((data ?? []) as FigureRow[]).filter(r => ['in_internal_review', 'client_suggested', 'client_rejected'].includes(r.status))
  const requires = await requiresClientApproval(eventId)
  const checks = await checkItems(eventId, rows)
  const blocked: Array<{ id: string; label: string; reason: string; needs_override?: boolean }> = []
  let approved = 0
  for (const r of rows) {
    const c = checks.get(r.id)
    if (c?.errors.length) { blocked.push({ id: r.id, label: r.label, reason: c.errors[0].message }); continue }
    const { data: rv } = await supabaseAdmin.from('event_public_figure_reviews').select('id').eq('event_id', eventId).eq('audience', 'client').eq('status', 'closed').contains('item_ids', [r.id]).order('closed_at', { ascending: false }).limit(1)
    const roundId = rv?.[0]?.id as string | undefined
    if (requires && !roundId) { blocked.push({ id: r.id, label: r.label, reason: 'The client has not reviewed this yet. Send it for client approval first.' }); continue }
    const { data: decs } = roundId ? await supabaseAdmin.from('event_public_figure_decisions').select('decision, seen_label, seen_payload').eq('review_id', roundId).eq('figure_id', r.id) : { data: [] }
    const route = finalRoute(r.kind, r.label, r.working_payload, (decs ?? []) as Array<{ decision: DecisionKind; seen_label: string | null; seen_payload: FigurePayload | null }>)
    if (requires && route === 'internal' && !override) { blocked.push({ id: r.id, label: r.label, reason: 'No client approver has approved this exact wording.', needs_override: true }); continue }
    await writeApproved(r, r.working_payload, r.label, route, by)
    await resolveFigureDecisions(r.id)
    approved++
  }
  return { approved, blocked }
}

// ── Reopen (§6.5) ───────────────────────────────────────────────────────────

export async function reopen(id: string, reason: string, by: string | null): Promise<FigureRow> {
  const f = await loadFigure(id)
  if (f.status !== 'approved') throw new FigureError('Only an approved item can be reopened.', 409)
  if (!reason.trim()) throw new FigureError('Say why you are reopening it.', 400)
  const { data, error } = await supabaseAdmin.from('event_public_figures').update({ status: 'edited_since_approval', updated_at: new Date().toISOString() }).eq('id', id).select(FIGURE_COLS).single()
  if (error) throw new FigureError(error.message, 500)
  await logFigureChange({ event_id: f.event_id, figure_id: id, action: 'reopen', before: { status: 'approved', approved_version: f.approved_version }, after: { status: 'edited_since_approval' }, reason: reason.trim(), by })
  return data as FigureRow
}

export { figureChangePairs, samePayload }
