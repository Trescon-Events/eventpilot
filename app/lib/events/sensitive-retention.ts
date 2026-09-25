import { supabaseAdmin } from '@/app/lib/supabase'

/* When Passport / National ID documents are automatically deleted (2026-09-25).

   Rule (Madhu): N days (default 30, events.sensitive_document_retention_days) after
   the LAST REAL EVENT DAY — not the event "cycle" (events.event_date / end_date span
   the whole planning cycle, e.g. 1 Oct 2025 -> 30 Nov 2026 for an event held 2-3 Nov).
   The real days live in actual_start_date / actual_end_date (events AND umbrellas).

   For an event under an umbrella the base is the LATER of its own last day and the
   umbrella's last day, so licence processing for the whole week is never cut off by
   an early-finishing child event.

   Fallback while no real day is set: the old behaviour (cycle end date, else today),
   reported as basis 'cycle_end' / 'none' so the UI can warn that the dates need setting.

   The stamped date lives on each document row (retention_expires_at); the daily purge
   cron only reads that column. Saving new event days re-stamps the documents already on file. */

export type RetentionBasis = 'actual_dates' | 'cycle_end' | 'none'
export type RetentionCalc = { expiresAt: string; basis: RetentionBasis; baseDate: string | null; retentionDays: number }
/** undefined = use what's stored; null = pretend it is unset; string = pretend it is that date (YYYY-MM-DD). */
export type EndOverride = { eventEnd?: string | null; umbrellaEnd?: string | null }

const DAY_MS = 86_400_000
const maxDate = (dates: (string | null | undefined)[]): string | null => dates.filter((d): d is string => !!d).sort().pop() ?? null

export async function computeRetention(eventId: string, override: EndOverride = {}): Promise<RetentionCalc> {
  const { data: ev } = await supabaseAdmin.from('events')
    .select('actual_end_date, end_date, umbrella_id, sensitive_document_retention_days').eq('id', eventId).maybeSingle()
  const retentionDays = ev?.sensitive_document_retention_days ?? 30

  let umbrellaActualEnd: string | null = null
  if (ev?.umbrella_id) {
    const { data: um } = await supabaseAdmin.from('event_umbrellas').select('actual_end_date').eq('id', ev.umbrella_id).maybeSingle()
    umbrellaActualEnd = um?.actual_end_date ?? null
  }
  const eventActualEnd = override.eventEnd !== undefined ? override.eventEnd : (ev?.actual_end_date ?? null)
  const umbrellaEnd = override.umbrellaEnd !== undefined ? override.umbrellaEnd : umbrellaActualEnd

  const actual = maxDate([eventActualEnd, umbrellaEnd])
  const cycleEnd: string | null = ev?.end_date ?? null
  const baseDate = actual ?? cycleEnd
  const basis: RetentionBasis = actual ? 'actual_dates' : cycleEnd ? 'cycle_end' : 'none'
  const baseMs = baseDate ? new Date(baseDate).getTime() : Date.now()
  return { expiresAt: new Date(baseMs + retentionDays * DAY_MS).toISOString(), basis, baseDate, retentionDays }
}

export type RetentionPlan = {
  perEvent: { eventId: string; calc: RetentionCalc; docs: number }[]
  totalDocs: number
  /** Active documents whose NEW deletion date is already in the past — they'd be deleted at the next daily run. */
  pastDue: number
}

/** What re-stamping would do, without changing anything. */
export async function planRetentionUpdate(eventIds: string[], override: EndOverride = {}): Promise<RetentionPlan> {
  const perEvent: RetentionPlan['perEvent'] = []
  let totalDocs = 0, pastDue = 0
  for (const eventId of eventIds) {
    const { count } = await supabaseAdmin.from('speaker_sensitive_documents').select('*', { count: 'exact', head: true }).eq('event_id', eventId).is('deleted_at', null)
    const docs = count ?? 0
    const calc = await computeRetention(eventId, override)
    perEvent.push({ eventId, calc, docs })
    totalDocs += docs
    if (docs && new Date(calc.expiresAt).getTime() <= Date.now()) pastDue += docs
  }
  return { perEvent, totalDocs, pastDue }
}

/** Re-stamps active documents' retention_expires_at from the (already saved) dates. Returns how many rows were updated. */
export async function applyRetentionUpdate(eventIds: string[]): Promise<number> {
  let updated = 0
  for (const eventId of eventIds) {
    const calc = await computeRetention(eventId)
    const { data } = await supabaseAdmin.from('speaker_sensitive_documents')
      .update({ retention_expires_at: calc.expiresAt }).eq('event_id', eventId).is('deleted_at', null).select('id')
    updated += data?.length ?? 0
  }
  return updated
}
