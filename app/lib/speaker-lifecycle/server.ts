import { supabaseAdmin } from '@/app/lib/supabase'
import { buildStats, isConfirmedFamily, withdrawalProblem, isDeleteReason, CONFIRMED_FAMILY, type SpeakerStats, type StatRow, type InviteRow } from './model'
import { strictEventDays } from '@/app/lib/events/event-days'

/* Speaker lifecycle (2026-11-10) — database side. Every status change is written to speaker_lifecycle_changes (who, when, from, to, why). */

export type LifecycleChange = { event_id: string; speaker_id: string; from_status: string | null; to_status: string | null; reason?: string | null; note?: string | null; source: string; changed_by: string | null }

/** Never throws: a failed audit row must not undo a status change that already happened, but it is logged loudly. */
export async function logLifecycleChanges(changes: LifecycleChange[]): Promise<void> {
  if (!changes.length) return
  const { error } = await supabaseAdmin.from('speaker_lifecycle_changes').insert(changes.map(c => ({ ...c, reason: c.reason ?? null, note: c.note ?? null })))
  if (error) console.error('[speaker-lifecycle] audit insert failed:', error.message)
}

const STAT_COLS = 'id, event_id, confirmation_status, announcement_status, delete_reason, planned_roles, withdrawal_reason, withdrawn_at'

export async function loadSpeakerStats(eventIds: string[]): Promise<SpeakerStats> {
  const [sp, inv, ev] = await Promise.all([
    supabaseAdmin.from('event_speakers').select(STAT_COLS).in('event_id', eventIds),
    supabaseAdmin.from('stakeholder_invites').select('event_id, recipient_email, status').in('event_id', eventIds).eq('form_type', 'speaker'),
    supabaseAdmin.from('events').select('id, actual_start_date, actual_end_date').in('id', eventIds),
  ])
  const starts: Record<string, string | null> = {}
  for (const e of ev.data ?? []) starts[e.id as string] = strictEventDays(e as { actual_start_date: string | null; actual_end_date: string | null }).start // real event days only: the project start can be months earlier
  return buildStats((sp.data ?? []) as StatRow[], (inv.data ?? []) as InviteRow[], starts)
}

export type PostEventCandidate = { id: string; name: string; company: string | null; status: string }

/** Confirmed speakers who are still on the roster: the people the post-event banner offers to mark as Spoke. */
export async function postEventCandidates(eventId: string): Promise<PostEventCandidate[]> {
  const { data } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, company, confirmation_status')
    .eq('event_id', eventId).neq('announcement_status', 'archived').in('confirmation_status', [...CONFIRMED_FAMILY]).order('name')
  return (data ?? []).map(s => ({ id: s.id as string, name: ((s.public_name as string) || (s.name as string)) ?? '', company: (s.company as string | null) ?? null, status: s.confirmation_status as string }))
}

/** Marks each listed speaker Spoke or No-show. Only a speaker who is still in a confirmed status changes, so a stale screen cannot overwrite a newer decision. */
export async function applyPostEventOutcomes(eventId: string, outcomes: { id: string; to: 'Spoke' | 'No-show' }[], by: string | null): Promise<{ changed: number; skipped: number }> {
  if (!outcomes.length) return { changed: 0, skipped: 0 }
  const { data: cur } = await supabaseAdmin.from('event_speakers').select('id, confirmation_status').eq('event_id', eventId).in('id', outcomes.map(o => o.id))
  const now = new Map((cur ?? []).map(r => [r.id as string, r.confirmation_status as string | null]))
  const log: LifecycleChange[] = []
  let changed = 0
  for (const o of outcomes) {
    const from = now.get(o.id)
    if (!isConfirmedFamily(from)) continue
    const { error } = await supabaseAdmin.from('event_speakers').update({ confirmation_status: o.to, updated_at: new Date().toISOString() }).eq('id', o.id).eq('event_id', eventId).eq('confirmation_status', from!)
    if (error) { console.error('[speaker-lifecycle] outcome update failed:', error.message); continue }
    changed++
    log.push({ event_id: eventId, speaker_id: o.id, from_status: from ?? null, to_status: o.to, source: 'post_event_bulk', changed_by: by })
  }
  await logLifecycleChanges(log)
  return { changed, skipped: outcomes.length - changed }
}

export type ClassifyOutcome = 'withdrew' | 'test' | 'duplicate' | 'mistake'

/** Cleanup for records that were deleted before reasons existed: says what each one really was. The record stays archived; only its meaning is recorded. */
export async function classifyDeleted(eventId: string, speakerId: string, outcome: ClassifyOutcome, reason: unknown, note: unknown, by: string | null): Promise<{ ok: true } | { error: string; status: number }> {
  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, announcement_status, confirmation_status').eq('id', speakerId).eq('event_id', eventId).maybeSingle()
  if (!s) return { error: 'Speaker not found on this event.', status: 404 }
  if (s.announcement_status !== 'archived') return { error: 'Only deleted speakers can be classified here.', status: 400 }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (outcome === 'withdrew') {
    const problem = withdrawalProblem(reason, note)
    if (problem) return { error: problem, status: 400 }
    Object.assign(patch, { confirmation_status: 'Withdrew', withdrawal_reason: reason, withdrawal_note: typeof note === 'string' && note.trim() ? note.trim() : null, delete_reason: null })
  } else {
    if (!isDeleteReason(outcome)) return { error: 'Unknown outcome.', status: 400 }
    patch.delete_reason = outcome
  }
  const { error } = await supabaseAdmin.from('event_speakers').update(patch).eq('id', speakerId)
  if (error) return { error: error.message, status: 500 }
  await logLifecycleChanges([{ event_id: eventId, speaker_id: speakerId, from_status: (s.confirmation_status as string | null) ?? null, to_status: outcome === 'withdrew' ? 'Withdrew' : `deleted:${outcome}`, reason: typeof reason === 'string' ? reason : outcome, note: typeof note === 'string' ? note : null, source: 'cleanup', changed_by: by }])
  return { ok: true }
}
