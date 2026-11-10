/* Speaker lifecycle (2026-11-10) — the pure part: statuses, reasons, roles, and how the statistics are counted. No database, no clock (callers pass `now`),
   so it can be unit-tested. Nothing here changes data. The words below are stored in event_speakers (see supabase/speaker_lifecycle_migration.sql). */

export const CONFIRMED_FAMILY = ['New Confirmed', 'Reconfirmed', 'Confirmed'] as const
export const LIFECYCLE_STATUSES = ['New Confirmed', 'Reconfirmed', 'Confirmed', 'On Hold', 'Withdrew', 'No-show', 'Spoke'] as const
export type LifecycleStatus = typeof LIFECYCLE_STATUSES[number]

export const WITHDRAWAL_REASONS = [
  { key: 'schedule_clash', label: 'Schedule clash' },
  { key: 'company_decision', label: 'Company decision' },
  { key: 'replaced', label: 'Replaced' },
  { key: 'no_response', label: 'No response' },
  { key: 'other', label: 'Other (note required)' },
] as const
export type WithdrawalReason = typeof WITHDRAWAL_REASONS[number]['key']

/** Deleting is for records that should not count at all. */
export const DELETE_REASONS = [
  { key: 'test', label: 'Test record' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'mistake', label: 'Entered by mistake' },
] as const
export type DeleteReason = typeof DELETE_REASONS[number]['key']

/** What a speaker was invited to do. One speaker can hold several (that is a dual role). */
export const PLANNED_ROLES = [
  { key: 'keynote', label: 'Keynote speaker' },
  { key: 'panelist', label: 'Panelist' },
  { key: 'moderator', label: 'Moderator' },
  { key: 'roundtable', label: 'Roundtable speaker' },
  { key: 'fireside', label: 'Fireside chat' },
  { key: 'speaker', label: 'Speaker' },
] as const
export type PlannedRole = typeof PLANNED_ROLES[number]['key']

const has = <T extends { key: string }>(list: readonly T[], k: unknown) => typeof k === 'string' && list.some(i => i.key === k)
export const isWithdrawalReason = (k: unknown): k is WithdrawalReason => has(WITHDRAWAL_REASONS, k)
export const isDeleteReason = (k: unknown): k is DeleteReason => has(DELETE_REASONS, k)
export const isLifecycleStatus = (k: unknown): k is LifecycleStatus => typeof k === 'string' && (LIFECYCLE_STATUSES as readonly string[]).includes(k)
export const cleanPlannedRoles = (v: unknown): PlannedRole[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is PlannedRole => has(PLANNED_ROLES, x)))] : []

export const isConfirmedFamily = (s: string | null | undefined) => (CONFIRMED_FAMILY as readonly string[]).includes(s ?? '')
/** Confirmed for the event, whether or not they ended up speaking. Used for the role and "took part" counts. */
export const tookPart = (s: string | null | undefined) => isConfirmedFamily(s) || s === 'Spoke' || s === 'No-show'
/** Who a post-event thank-you note goes to by default. */
export const eligibleForThankYou = (s: string | null | undefined) => isConfirmedFamily(s) || s === 'Spoke'

/** A withdrawal needs a reason; "Other" also needs a note. Returns the message to show, or null when fine. */
export function withdrawalProblem(reason: unknown, note: unknown): string | null {
  if (!isWithdrawalReason(reason)) return 'Choose why the speaker withdrew.'
  if (reason === 'other' && !(typeof note === 'string' && note.trim())) return 'Add a short note for "Other".'
  return null
}

/** The event is over once its last day has finished (UTC), so a Dubai or Bengaluru evening is still "the event". */
export function eventHasEnded(endDate: string | null | undefined, now: Date): boolean {
  if (!endDate || !/^\d{4}-\d{2}-\d{2}/.test(endDate)) return false
  return now.getTime() >= Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`) + 86_400_000
}

export const WITHDRAWAL_TIMING = ['More than 14 days before', '8 to 14 days before', 'Within 7 days before', 'On or after the event day', 'Date not recorded'] as const
export function withdrawalTiming(withdrawnAt: string | null | undefined, eventStart: string | null | undefined): typeof WITHDRAWAL_TIMING[number] {
  if (!withdrawnAt || !eventStart) return 'Date not recorded'
  const days = (Date.parse(`${eventStart.slice(0, 10)}T00:00:00Z`) - Date.parse(withdrawnAt)) / 86_400_000
  if (days > 14) return 'More than 14 days before'
  if (days > 7) return '8 to 14 days before'
  if (days > 0) return 'Within 7 days before'
  return 'On or after the event day'
}

export type StatRow = {
  id: string; event_id: string; confirmation_status: string | null; announcement_status: string | null
  delete_reason: string | null; planned_roles: string[] | null; withdrawal_reason: string | null; withdrawn_at: string | null
}
export type InviteRow = { event_id: string; recipient_email: string; status: string }

export type SpeakerStats = {
  invited: number; invites_answered: number
  records: number
  confirmed_now: number; took_part: number; spoke: number; no_show: number; withdrew: number; on_hold: number; status_not_set: number
  withdrawal_reasons: Record<string, number>
  withdrawal_timing: Record<string, number>
  roles: Record<string, number>; role_not_set: number; dual_role: number
  deleted_classified: number; deleted_unclassified: number
}

/** Counts speakers. Records deleted with a reason (test, duplicate, mistake) never count. A deleted record with no reason, that is not already marked
    Withdrew, is "not yet classified" and is reported separately instead of being guessed at. */
export function buildStats(rows: StatRow[], invites: InviteRow[], eventStarts: Record<string, string | null | undefined>): SpeakerStats {
  const s: SpeakerStats = {
    invited: 0, invites_answered: 0, records: 0, confirmed_now: 0, took_part: 0, spoke: 0, no_show: 0, withdrew: 0, on_hold: 0, status_not_set: 0,
    withdrawal_reasons: {}, withdrawal_timing: {}, roles: {}, role_not_set: 0, dual_role: 0, deleted_classified: 0, deleted_unclassified: 0,
  }
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
  for (const r of rows) {
    if (r.delete_reason) { s.deleted_classified++; continue }
    if (r.announcement_status === 'archived' && r.confirmation_status !== 'Withdrew') { s.deleted_unclassified++; continue }
    s.records++
    const st = r.confirmation_status
    if (isConfirmedFamily(st)) s.confirmed_now++
    else if (st === 'Spoke') s.spoke++
    else if (st === 'No-show') s.no_show++
    else if (st === 'On Hold') s.on_hold++
    else if (st === 'Withdrew') {
      s.withdrew++
      bump(s.withdrawal_reasons, r.withdrawal_reason ?? 'not_recorded')
      bump(s.withdrawal_timing, withdrawalTiming(r.withdrawn_at, eventStarts[r.event_id]))
    } else s.status_not_set++
    if (tookPart(st)) {
      s.took_part++
      const roles = cleanPlannedRoles(r.planned_roles)
      if (roles.length === 0) s.role_not_set++
      for (const role of roles) bump(s.roles, role)
      if (roles.length > 1) s.dual_role++
    }
  }
  s.took_part = s.confirmed_now + s.spoke + s.no_show
  const invited = new Set<string>(), answered = new Set<string>()
  for (const i of invites) {
    if (i.status !== 'sent' && i.status !== 'submitted') continue
    const k = `${i.event_id}|${i.recipient_email.trim().toLowerCase()}`
    invited.add(k); if (i.status === 'submitted') answered.add(k)
  }
  s.invited = invited.size; s.invites_answered = answered.size
  return s
}
