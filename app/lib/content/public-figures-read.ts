import { supabaseAdmin } from '@/app/lib/supabase'
import type { FigureKind } from './public-figures-catalogue'
import { figureChangePairs, figureChangeReason, type FigurePayload, type Pair } from './public-figures-model'

/* Public figures, READ side (docs/build_suggestions/public-figures.md §7). The only thing any tool may call. It returns APPROVED, ACTIVE items only (their
   approved_payload, never the working copy), and it never throws: a missing table or a database error is "no figures", so a tool's output cannot change by accident
   (§3.4). Kept free of the Copy Library imports so the Copy Library can use it without a cycle. */

export type PublicFigure = {
  id: string; catalogue_key: string | null; category: string; group_label: string | null; label: string; kind: FigureKind; payload: FigurePayload; version: number; basis: 'measured' | 'estimate'
}

export type FigureQuery = { categories?: string[]; keys?: string[]; groupLabel?: string | null; includeEstimates?: boolean }

export async function getPublicFigures(eventId: string, q: FigureQuery = {}): Promise<PublicFigure[]> {
  try {
    let query = supabaseAdmin.from('event_public_figures')
      .select('id, catalogue_key, category, group_label, approved_label, label, kind, approved_payload, approved_version, basis, sort_order')
      .eq('event_id', eventId).eq('is_active', true).not('approved_payload', 'is', null).order('sort_order').order('label')
    if (q.categories?.length) query = query.in('category', q.categories)
    if (q.keys?.length) query = query.in('catalogue_key', q.keys)
    if (q.groupLabel !== undefined) query = q.groupLabel === null ? query.is('group_label', null) : query.eq('group_label', q.groupLabel)
    const { data, error } = await query
    if (error) return []
    const rows = (data ?? []).map(r => ({
      id: r.id as string, catalogue_key: (r.catalogue_key as string | null) ?? null, category: r.category as string, group_label: (r.group_label as string | null) ?? null,
      label: ((r.approved_label as string | null) ?? (r.label as string)), kind: r.kind as FigureKind, payload: r.approved_payload as FigurePayload, version: r.approved_version as number, basis: r.basis as 'measured' | 'estimate',
    }))
    return q.includeEstimates === false ? rows.filter(r => r.basis !== 'estimate') : rows
  } catch { return [] }
}

/** The caller records what it used. Bookkeeping only: never fails a tool. */
export async function recordFigureUsage(u: { figure_id: string; version: number; consumer_type: string; consumer_id?: string | null; mode: 'live' | 'sent' }): Promise<void> {
  try { await supabaseAdmin.from('event_public_figure_usages').insert({ figure_id: u.figure_id, version: u.version, consumer_type: u.consumer_type, consumer_id: u.consumer_id ?? null, mode: u.mode }) }
  catch { /* ignore */ }
}

/** A source reference stored on a Copy Library item that was built from an approved public figure. */
export type PublicFigureRef = { type: 'public_figure'; figure_id: string; version: number }
export const isFigureRef = (r: unknown): r is PublicFigureRef => !!r && typeof r === 'object' && (r as { type?: string }).type === 'public_figure' && typeof (r as { figure_id?: unknown }).figure_id === 'string'

/** For each referenced figure that has a newer approved version than the one a Copy Library item was built from: what changed, as readable pairs. */
export async function figureRefChanges(refs: PublicFigureRef[]): Promise<{ changed: boolean; reason: string | null; pairs: Pair[]; current: Map<string, number> }> {
  const current = new Map<string, number>()
  if (!refs.length) return { changed: false, reason: null, pairs: [], current }
  const { data: figs } = await supabaseAdmin.from('event_public_figures').select('id, kind, label, approved_label, approved_version, is_active').in('id', refs.map(r => r.figure_id))
  const byId = new Map((figs ?? []).map(f => [f.id as string, f]))
  const pairs: Pair[] = []; const reasons: string[] = []
  let changed = false
  for (const ref of refs) {
    const f = byId.get(ref.figure_id)
    if (!f) { changed = true; reasons.push('A figure this was built from was removed.'); continue }
    current.set(ref.figure_id, f.approved_version as number)
    if (!f.is_active) { changed = true; reasons.push(`${f.label}: removed from the public figures.`); continue }
    if ((f.approved_version as number) <= ref.version) continue
    changed = true
    const { data: vs } = await supabaseAdmin.from('event_public_figure_versions').select('version, label, payload').eq('figure_id', ref.figure_id).in('version', [ref.version, f.approved_version as number])
    const was = vs?.find(v => v.version === ref.version), now = vs?.find(v => v.version === f.approved_version)
    const p = was && now ? figureChangePairs(f.kind as FigureKind, f.label as string, was.payload as FigurePayload, now.payload as FigurePayload) : []
    pairs.push(...p)
    reasons.push(figureChangeReason((now?.label as string | undefined) ?? (f.label as string), p))
  }
  return { changed, reason: changed ? reasons.slice(0, 3).join('; ') : null, pairs, current }
}
