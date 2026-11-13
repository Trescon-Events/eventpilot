import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { ContentOwnerRef } from './owner'
import { clientApprovalRequired } from './copy-model'
import { findingsFor, flagItemsForFigure } from './copy-library'
import type { ValidationFinding } from './validate'
import { FIGURE_CATALOGUE, FIGURE_CATALOGUE_BY_KEY, entriesForCategory, type FigureKind } from './public-figures-catalogue'
import {
  breakdownSumWarning, clientView, figureChangePairs, isFilled, normalizePayload, samePayload, statusAfterFigureEdit, textsToCheck, type FigurePayload, type FigureStatus,
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

async function loadFigure(id: string): Promise<FigureRow> {
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

export type Decision = { review_id: string; figure_id: string; decision: 'approve' | 'reject' | 'suggest'; suggested_label: string | null; suggested_payload: FigurePayload | null; comment: string | null; decided_at: string; resolved_at: string | null; audience: 'internal' | 'client'; reviewer_name: string | null }

export async function listFigures(eventId: string) {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true).order('sort_order').order('label')
  const rows = (data ?? []) as FigureRow[]
  const ids = rows.map(r => r.id)
  const [checks, decisionsRes, usagesRes, requires] = await Promise.all([
    checkItems(eventId, rows.map(r => ({ id: r.id, kind: r.kind, label: r.label, working_payload: r.working_payload }))),
    ids.length ? supabaseAdmin.from('event_public_figure_decisions').select('review_id, figure_id, decision, suggested_label, suggested_payload, comment, decided_at, resolved_at, event_public_figure_reviews(audience, reviewer_name, status)').in('figure_id', ids).order('decided_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? supabaseAdmin.from('event_public_figure_usages').select('figure_id, version, mode, consumer_type').in('figure_id', ids) : Promise.resolve({ data: [] }),
    requiresClientApproval(eventId),
  ])
  // only decisions from a round that has been submitted count
  const latest = new Map<string, Decision>()
  for (const d of (decisionsRes.data ?? []) as unknown as Array<Decision & { event_public_figure_reviews: { audience: 'internal' | 'client'; reviewer_name: string | null; status: string } | null }>) {
    const rv = d.event_public_figure_reviews
    if (!rv || rv.status !== 'closed' || latest.has(d.figure_id)) continue
    latest.set(d.figure_id, { ...d, audience: rv.audience, reviewer_name: rv.reviewer_name })
  }
  const alerts = new Map<string, number>()
  for (const u of (usagesRes.data ?? []) as Array<{ figure_id: string; version: number; mode: string }>) {
    const fig = rows.find(r => r.id === u.figure_id)
    if (fig && u.mode === 'live' && u.version < fig.approved_version) alerts.set(u.figure_id, (alerts.get(u.figure_id) ?? 0) + 1)
  }
  const usageCount = new Map<string, number>()
  for (const u of (usagesRes.data ?? []) as Array<{ figure_id: string }>) usageCount.set(u.figure_id, (usageCount.get(u.figure_id) ?? 0) + 1)
  return {
    requires_client_approval: requires,
    items: rows.map(r => ({ ...r, errors: checks.get(r.id)?.errors ?? [], warnings: checks.get(r.id)?.warnings ?? [], decision: latest.get(r.id) ?? null, update_available: alerts.get(r.id) ?? 0, usage_count: usageCount.get(r.id) ?? 0 })),
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
async function writeApproved(f: FigureRow, payload: FigurePayload, label: string, route: Route, by: string | null): Promise<FigureRow> {
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

// ── Review rounds (§6.2, §6.3) ──────────────────────────────────────────────

export async function sendReview(eventId: string, audience: 'internal' | 'client', ids: string[] | null, by: string | null): Promise<{ review_id: string; token: string; count: number }> {
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true)
  const all = (data ?? []) as FigureRow[]
  const wanted = audience === 'client'
    ? all.filter(r => r.status === 'in_internal_review')
    : all.filter(r => (r.status === 'draft' || r.status === 'edited_since_approval') && isFilled(r.kind, r.working_payload))
  const rows = ids ? wanted.filter(r => ids.includes(r.id)) : wanted
  if (!rows.length) throw new FigureError(audience === 'client' ? 'No items are waiting for client approval. Approve items internally first.' : 'No filled-in draft items to send. Fill in values first.', 409)
  if (audience === 'internal') {
    const checks = await checkItems(eventId, rows)
    const bad = rows.find(r => checks.get(r.id)?.errors.length)
    if (bad) throw new FigureError(`“${bad.label}” breaks the event’s rules: ${checks.get(bad.id)!.errors[0].message}`, 409)
  }
  const token = randomBytes(24).toString('base64url')
  const { data: rv, error } = await supabaseAdmin.from('event_public_figure_reviews').insert({ event_id: eventId, audience, review_token: token, item_ids: rows.map(r => r.id), sent_by: actor(by) }).select('id').single()
  if (error) throw new FigureError(error.message, 500)
  if (audience === 'client') await supabaseAdmin.from('event_public_figures').update({ status: 'pending_client', updated_at: new Date().toISOString() }).in('id', rows.map(r => r.id))
  await logFigureChange({ event_id: eventId, figure_id: null, action: audience === 'client' ? 'send_client_review' : 'send_internal_review', after: { review_id: rv.id, items: rows.map(r => r.label) }, by })
  return { review_id: rv.id as string, token, count: rows.length }
}

export type ReviewView = {
  status: 'open' | 'closed'; audience: 'internal' | 'client'; event_name: string | null; reviewer_name: string | null
  items: Array<ReturnType<typeof clientView> & { decision: { decision: 'approve' | 'reject' | 'suggest'; suggested_label: string | null; suggested_payload: FigurePayload | null; comment: string | null } | null }>
}

async function loadReview(token: string) {
  const { data: rv } = await supabaseAdmin.from('event_public_figure_reviews').select('*').eq('review_token', token).maybeSingle()
  return rv
}

/** What the reviewer sees. Never the source, the notes, the evidence or the owner. */
export async function loadReviewForReviewer(token: string): Promise<ReviewView | null> {
  const rv = await loadReview(token)
  if (!rv) return null
  const [{ data: figs }, { data: decs }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_public_figures').select('id, kind, category, group_label, label, working_payload, basis, sort_order').in('id', rv.item_ids as string[]).order('sort_order'),
    supabaseAdmin.from('event_public_figure_decisions').select('figure_id, decision, suggested_label, suggested_payload, comment').eq('review_id', rv.id),
    supabaseAdmin.from('events').select('name, public_name').eq('id', rv.event_id).maybeSingle(),
  ])
  const dec = new Map((decs ?? []).map(d => [d.figure_id as string, d]))
  return {
    status: rv.status, audience: rv.audience, event_name: (ev?.public_name as string | null) || (ev?.name as string | null) || null, reviewer_name: rv.reviewer_name ?? null,
    items: (figs ?? []).map(f => ({ ...clientView(f as never), decision: dec.get(f.id as string) ? { decision: dec.get(f.id as string)!.decision as 'approve', suggested_label: (dec.get(f.id as string)!.suggested_label as string | null) ?? null, suggested_payload: (dec.get(f.id as string)!.suggested_payload as FigurePayload | null) ?? null, comment: (dec.get(f.id as string)!.comment as string | null) ?? null } : null })),
  }
}

/** Partial progress saves; nothing changes on the item until Submit. */
export async function saveDecision(token: string, input: { figure_id: string; decision: 'approve' | 'reject' | 'suggest'; suggested_label?: string; suggested_payload?: unknown; comment?: string }): Promise<void> {
  const rv = await loadReview(token)
  if (!rv) throw new FigureError('This review link is not valid.', 404)
  if (rv.status !== 'open') throw new FigureError('This review has already been submitted.', 409)
  if (!(rv.item_ids as string[]).includes(input.figure_id)) throw new FigureError('That item is not part of this review.', 400)
  const comment = (input.comment ?? '').trim()
  if (input.decision === 'reject' && !comment) throw new FigureError('Please say why you are rejecting it.', 400)
  let suggestedPayload: FigurePayload | null = null
  if (input.decision === 'suggest') {
    const f = await loadFigure(input.figure_id)
    suggestedPayload = normalizePayload(f.kind, input.suggested_payload)
    if (!isFilled(f.kind, suggestedPayload)) throw new FigureError('Type the wording you would like instead.', 400)
  }
  const { error } = await supabaseAdmin.from('event_public_figure_decisions').upsert({
    review_id: rv.id, figure_id: input.figure_id, decision: input.decision, suggested_label: input.decision === 'suggest' ? ((input.suggested_label ?? '').replace(/\s+/g, ' ').trim() || null) : null,
    suggested_payload: suggestedPayload, comment: comment || null, decided_at: new Date().toISOString(), resolved_at: null,
  }, { onConflict: 'review_id,figure_id' })
  if (error) throw new FigureError(error.message, 500)
}

export async function approveAllRemaining(token: string): Promise<number> {
  const rv = await loadReview(token)
  if (!rv) throw new FigureError('This review link is not valid.', 404)
  if (rv.status !== 'open') throw new FigureError('This review has already been submitted.', 409)
  const { data: have } = await supabaseAdmin.from('event_public_figure_decisions').select('figure_id').eq('review_id', rv.id)
  const done = new Set((have ?? []).map(d => d.figure_id as string))
  const rest = (rv.item_ids as string[]).filter(id => !done.has(id))
  if (rest.length) { const { error } = await supabaseAdmin.from('event_public_figure_decisions').insert(rest.map(id => ({ review_id: rv.id, figure_id: id, decision: 'approve' }))); if (error) throw new FigureError(error.message, 500) }
  return rest.length
}

/** Closes the round and applies every decision. An item changed after the round was sent is left alone (it is no longer what was reviewed). */
export async function submitReview(token: string, reviewer: { name: string; email: string }): Promise<{ approved: number; suggested: number; rejected: number; undecided: number }> {
  const rv = await loadReview(token)
  if (!rv) throw new FigureError('This review link is not valid.', 404)
  if (rv.status !== 'open') throw new FigureError('This review has already been submitted.', 409)
  const name = reviewer.name.trim(), email = reviewer.email.trim()
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new FigureError('Please enter your name and a valid email address.', 400)
  const eventId = rv.event_id as string
  const requires = await requiresClientApproval(eventId)
  const [{ data: figs }, { data: decs }] = await Promise.all([
    supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).in('id', rv.item_ids as string[]),
    supabaseAdmin.from('event_public_figure_decisions').select('figure_id, decision').eq('review_id', rv.id),
  ])
  const dec = new Map((decs ?? []).map(d => [d.figure_id as string, d.decision as string]))
  const sentAt = new Date(rv.sent_at as string).getTime()
  const out = { approved: 0, suggested: 0, rejected: 0, undecided: 0 }
  const waiting: FigureStatus[] = rv.audience === 'client' ? ['pending_client'] : ['draft', 'edited_since_approval', 'in_internal_review']
  const setStatus = async (f: FigureRow, status: FigureStatus, action: string) => {
    await supabaseAdmin.from('event_public_figures').update({ status, updated_at: new Date().toISOString() }).eq('id', f.id)
    await logFigureChange({ event_id: eventId, figure_id: f.id, action, before: { status: f.status }, after: { status }, reason: `${name} <${email}>`, by: null })
  }
  for (const f of (figs ?? []) as FigureRow[]) {
    const changedSince = new Date(f.updated_at).getTime() > sentAt + 1000 && rv.audience === 'internal'
    if (!waiting.includes(f.status) || changedSince) continue
    const d = dec.get(f.id)
    if (d === 'approve') {
      if (rv.audience === 'client') await writeApproved(f, f.working_payload, f.label, 'client', null)
      else await internalApprove(f, requires, null)
      out.approved++
    } else if (d === 'suggest') { await setStatus(f, 'client_suggested', `${rv.audience}_suggested`); out.suggested++ }
    else if (d === 'reject') { await setStatus(f, 'client_rejected', `${rv.audience}_rejected`); out.rejected++ }
    else { if (rv.audience === 'client') await setStatus(f, 'in_internal_review', 'client_left_undecided'); out.undecided++ }
  }
  await supabaseAdmin.from('event_public_figure_reviews').update({ status: 'closed', closed_at: new Date().toISOString(), reviewer_name: name, reviewer_email: email }).eq('id', rv.id)
  await logFigureChange({ event_id: eventId, figure_id: null, action: `${rv.audience}_review_submitted`, after: { review_id: rv.id, ...out }, reason: `${name} <${email}>`, by: null })
  return out
}

// ── Resolving a round (§6.4) ────────────────────────────────────────────────

async function openDecision(figureId: string) {
  const { data } = await supabaseAdmin.from('event_public_figure_decisions').select('review_id, decision, suggested_label, suggested_payload, comment, resolved_at, event_public_figure_reviews!inner(status)').eq('figure_id', figureId).is('resolved_at', null).order('decided_at', { ascending: false })
  return (data ?? []).find(d => (d as unknown as { event_public_figure_reviews: { status: string } }).event_public_figure_reviews.status === 'closed') ?? null
}
async function resolveDecision(figureId: string, reviewId: string) {
  await supabaseAdmin.from('event_public_figure_decisions').update({ resolved_at: new Date().toISOString() }).eq('figure_id', figureId).eq('review_id', reviewId)
}

/** Accept the reviewer's suggestion exactly: approved at once, no second round (§6.4). Rule errors in the suggestion block it; the producer counters instead. */
export async function acceptSuggestion(id: string, by: string | null): Promise<FigureRow> {
  const f = await loadFigure(id)
  if (f.status !== 'client_suggested') throw new FigureError('There is no suggestion to accept on this item.', 409)
  const d = await openDecision(id)
  if (!d || d.decision !== 'suggest' || !d.suggested_payload) throw new FigureError('There is no suggestion to accept on this item.', 409)
  const payload = normalizePayload(f.kind, d.suggested_payload)
  const label = (d.suggested_label as string | null) || f.label
  const c = (await checkItems(f.event_id, [{ id, kind: f.kind, label, working_payload: payload }])).get(id)
  if (c?.errors.length) throw new FigureError(`The suggestion breaks the event’s rules (${c.errors[0].message}). Counter it with your own wording instead.`, 409, { findings: c.errors })
  const out = await writeApproved(f, payload, label, 'client_suggestion_accepted', by)
  await resolveDecision(id, d.review_id as string)
  return out
}

/** Counter a suggestion, or revise a rejected item: the producer's own wording. With client approval required it joins the next client round. */
export async function reviseAndResend(id: string, patch: { label?: string; payload?: unknown }, by: string | null): Promise<FigureRow> {
  const f = await loadFigure(id)
  if (f.status !== 'client_suggested' && f.status !== 'client_rejected') throw new FigureError('Only an item with a suggestion or a rejection can be revised here.', 409)
  const d = await openDecision(id)
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
  if (d) await resolveDecision(id, d.review_id as string)
  return data as FigureRow
}

/** Remove an item the reviewer rejected from the public set (kept for the audit trail). */
export async function removeAfterReview(id: string, by: string | null): Promise<void> {
  const d = await openDecision(id)
  await removeItem(id, by)
  if (d) await resolveDecision(id, d.review_id as string)
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
