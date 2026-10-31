import { supabaseAdmin } from '@/app/lib/supabase'
import { MAX_TABLES } from './tables'

/* Table Screens, Phase 2 — the live control. The console (EventPilot, in the browser) says what each table should show; the small program on the technician's laptop fetches that over the
   internet every couple of seconds, keeps each table's image on the laptop, and serves /table/1..N to the table PCs over the local network (which have no internet). The laptop never needs to be
   reachable from outside, so there is no mixed-content or firewall problem, and everything except the program itself is updated here without reinstalling anything. */

/** Version of the program that ships with this code. The console says "Update the program" only when the running one is older than MIN_PROGRAM_VERSION. */
export const PROGRAM_VERSION = 1
export const MIN_PROGRAM_VERSION = 1

export type TableMode = 'card' | 'standby' | 'blank'
export type TableShow = { mode: TableMode; name?: string; moderator?: boolean; img?: string }
export type LiveState = { tables: Record<string, TableShow>; template?: string; standby_template?: string; session?: string; identify_until?: number; sent_at?: string }
export type ProgramStatus = { version?: number; lan?: string[]; seen?: Record<string, number>; has?: Record<string, string> }

export type LiveView = {
  seq: number; state: LiveState
  program: { online: boolean; version: number | null; needs_update: boolean; lan: string[]; tables: Record<string, { seen_ms_ago: number | null; showing: string | null }> } | null
  server_now: number
}

const clampName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 120) : '')
const ONLINE_MS = 12_000

export type LiveCommand =
  | { action: 'show'; tables: { n: number; mode: TableMode; name?: string; moderator?: boolean }[]; template?: string; standby_template?: string; session?: string }
  | { action: 'all'; mode: 'standby' | 'blank'; table_count?: number; standby_template?: string }
  | { action: 'identify'; seconds?: number }

/** The address (relative to the link) of the PNG a table should show. */
function imgFor(t: { mode: TableMode; name?: string; moderator?: boolean }, template?: string, standbyTemplate?: string): string | undefined {
  if (t.mode === 'blank') return undefined
  const q = new URLSearchParams()
  if (t.mode === 'standby') { q.set('standby', '1'); if (standbyTemplate) q.set('template', standbyTemplate) }
  else { q.set('name', t.name ?? ''); if (t.moderator) q.set('moderator', '1'); if (template) q.set('template', template) }
  return `/tables/card?${q}`
}

export function applyCommand(prev: LiveState, cmd: LiveCommand, now = Date.now()): { state: LiveState } | { error: string } {
  const state: LiveState = { ...prev, tables: { ...prev.tables } }
  if (cmd.action === 'identify') { state.identify_until = now + Math.min(60, Math.max(3, Math.trunc(cmd.seconds ?? 15))) * 1000; return { state } }
  if (cmd.action === 'all') {
    const count = Math.min(MAX_TABLES, Math.max(1, Math.trunc(cmd.table_count ?? MAX_TABLES)))
    const sb = typeof cmd.standby_template === 'string' ? cmd.standby_template : state.standby_template
    state.tables = {}
    for (let n = 1; n <= count; n++) state.tables[String(n)] = { mode: cmd.mode, img: imgFor({ mode: cmd.mode }, undefined, sb) }
    state.standby_template = sb; state.session = undefined; state.sent_at = new Date(now).toISOString()
    return { state }
  }
  if (cmd.action === 'show') {
    if (!Array.isArray(cmd.tables) || !cmd.tables.length) return { error: 'Nothing to show.' }
    const seen = new Set<number>()
    state.template = typeof cmd.template === 'string' ? cmd.template : state.template
    state.standby_template = typeof cmd.standby_template === 'string' ? cmd.standby_template : state.standby_template
    for (const t of cmd.tables.slice(0, MAX_TABLES)) {
      const n = Math.trunc(Number(t.n))
      if (!(n >= 1 && n <= MAX_TABLES)) return { error: `Table ${t.n} does not exist.` }
      if (seen.has(n)) return { error: `Table ${n} is listed twice.` }
      seen.add(n)
      const mode: TableMode = t.mode === 'standby' || t.mode === 'blank' ? t.mode : 'card'
      const name = clampName(t.name)
      if (mode === 'card' && !name) return { error: `Table ${n} has no name.` }
      state.tables[String(n)] = { mode, ...(mode === 'card' ? { name, moderator: t.moderator === true } : {}), img: imgFor({ mode, name, moderator: t.moderator === true }, state.template, state.standby_template) }
    }
    state.session = clampName(cmd.session) || undefined; state.sent_at = new Date(now).toISOString()
    return { state }
  }
  return { error: 'Unknown command.' }
}

export async function getLive(eventId: string): Promise<LiveView> {
  const { data, error } = await supabaseAdmin.from('event_table_screens_live').select('*').eq('event_id', eventId).maybeSingle()
  if (error) throw new Error(/relation .* does not exist|schema cache/i.test(error.message) ? 'Live control needs a one-time database update (event_table_screens_live_migration.sql).' : error.message)
  const now = Date.now()
  const state = ((data?.state as LiveState | undefined) ?? { tables: {} })
  const p = (data?.program as ProgramStatus | null) ?? null
  const seenAt = data?.program_seen_at ? new Date(data.program_seen_at as string).getTime() : 0
  const online = !!p && now - seenAt < ONLINE_MS
  const tables: Record<string, { seen_ms_ago: number | null; showing: string | null }> = {}
  for (const [n, ago] of Object.entries(p?.seen ?? {})) tables[n] = { seen_ms_ago: typeof ago === 'number' ? ago + (now - seenAt) : null, showing: p?.has?.[n] ?? null }
  return {
    seq: Number(data?.seq ?? 0), state,
    program: p ? { online, version: p.version ?? null, needs_update: (p.version ?? 0) < MIN_PROGRAM_VERSION, lan: p.lan ?? [], tables } : null,
    server_now: now,
  }
}

export async function runCommand(eventId: string, cmd: LiveCommand): Promise<{ view: LiveView } | { error: string }> {
  const cur = await getLive(eventId)
  const r = applyCommand(cur.state, cmd)
  if ('error' in r) return r
  const { error } = await supabaseAdmin.from('event_table_screens_live').upsert({ event_id: eventId, state: r.state, seq: cur.seq + 1, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (error) return { error: error.message }
  return { view: await getLive(eventId) }
}

export async function recordHeartbeat(eventId: string, body: unknown): Promise<void> {
  const b = (body ?? {}) as { version?: unknown; lan?: unknown; seen?: unknown; has?: unknown }
  const num = (o: unknown) => Object.fromEntries(Object.entries((o && typeof o === 'object' ? o : {}) as Record<string, unknown>).filter(([k, v]) => /^\d{1,2}$/.test(k) && typeof v === 'number').map(([k, v]) => [k, v as number]))
  const str = (o: unknown) => Object.fromEntries(Object.entries((o && typeof o === 'object' ? o : {}) as Record<string, unknown>).filter(([k, v]) => /^\d{1,2}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 80)]))
  const program: ProgramStatus = { version: typeof b.version === 'number' ? b.version : undefined, lan: Array.isArray(b.lan) ? b.lan.filter((x): x is string => typeof x === 'string').slice(0, 6).map(x => x.slice(0, 80)) : [], seen: num(b.seen), has: str(b.has) }
  await supabaseAdmin.from('event_table_screens_live').upsert({ event_id: eventId, program, program_seen_at: new Date().toISOString() }, { onConflict: 'event_id' })
}
