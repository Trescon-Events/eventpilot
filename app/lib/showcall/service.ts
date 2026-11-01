import { NextRequest, NextResponse } from 'next/server'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'
import { isModeratorRole } from '@/app/lib/screens/geometry'
import { ackOf, buildRows, defaultsFor, editableKeys, hmToSec, type AgendaSession, type Cue, type Fields, type Person, type Row } from './model'

/* Show Caller — database side. The sheet is rebuilt from the live agenda on every read; the cue rows hold only what the show caller typed (see model.ts).
   Producers reach it with the Show Caller permission; the show caller with a private link (event_screen_links, kind 'showcall'). */

export async function requireShowcall(req: NextRequest, eventId: string, level: 'view' | 'edit'): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const has = (key: string) => hasEventPermission(session.sid, eventId, key)
  const allowed = session.adm || (await has('sae.showcall.manage')) || (level === 'view' && (await has('sae.showcall.view')))
  if (!allowed) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  return { session }
}

export type SheetData = { event_name: string; timezone: string; stages: { id: string; name: string }[]; rows: Row[]; server_time: string }

const clean = (v: string | null | undefined) => (v ?? '').trim()

/** Published agenda sessions with a time, with their speakers (moderator first, then agenda order). */
async function loadAgenda(eventId: string): Promise<{ sessions: AgendaSession[]; stages: { id: string; name: string }[]; timezone: string; eventName: string }> {
  const [{ data: ev }, { data: tracks }, { data: sess }, roles] = await Promise.all([
    supabaseAdmin.from('events').select('name, timezone').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_tracks').select('id, name, order_index').eq('event_id', eventId).order('order_index'),
    supabaseAdmin.from('event_agenda_sessions').select('id, track_id, title, content_type, start_timestamp, end_timestamp').eq('event_id', eventId).eq('status', 'published').not('start_timestamp', 'is', null),
    getEventRoles(eventId),
  ])
  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  const stages = (tracks ?? []).map(t => ({ id: t.id as string, name: t.name as string }))
  const ids = (sess ?? []).map(s => s.id as string)
  const [{ data: links }] = await Promise.all([ids.length ? supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', ids).order('order_index') : Promise.resolve({ data: [] as { session_id: string; speaker_id: string; role_tag_id: string | null; order_index: number | null }[] }) ])
  const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id))]
  const { data: people } = speakerIds.length
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company, konfhub_primary_role_tag_id').eq('event_id', eventId).eq('active', true).in('id', speakerIds)
    : { data: [] as Record<string, unknown>[] }
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
  const stageName = new Map(stages.map(s => [s.id, s.name]))

  const sessions: AgendaSession[] = []
  for (const s of sess ?? []) {
    const byPerson = new Map<string, { moderator: boolean; order: number }>()
    for (const l of (links ?? []).filter(x => x.session_id === s.id)) {
      if (!person.has(l.speaker_id)) continue
      const tag = l.role_tag_id || resolvePrimaryRole(person.get(l.speaker_id)?.konfhub_primary_role_tag_id as string | null | undefined, roles)?.tag_id
      const mod = isModeratorRole(tag ? roleLabel.get(tag) : null)
      const prev = byPerson.get(l.speaker_id)
      byPerson.set(l.speaker_id, { moderator: (prev?.moderator ?? false) || mod, order: Math.min(prev?.order ?? 1e9, l.order_index ?? 0) })
    }
    const people: Person[] = [...byPerson.entries()]
      .sort((a, b) => Number(b[1].moderator) - Number(a[1].moderator) || a[1].order - b[1].order)
      .map(([id, m]) => { const p = person.get(id)!; return { name: clean((p.public_name as string) || (p.name as string)), title: clean(p.role as string), company: clean(p.company as string), moderator: m.moderator } })
    const a = utcToZonedLocal(s.start_timestamp as string, tz), b = s.end_timestamp ? utcToZonedLocal(s.end_timestamp as string, tz) : a
    const startSec = hmToSec(a.slice(11, 16))!, endDay = b.slice(0, 10) > a.slice(0, 10) ? 86400 : 0
    sessions.push({ id: s.id as string, title: clean(s.title as string), trackId: (s.track_id as string | null) ?? null, stage: s.track_id ? stageName.get(s.track_id as string) ?? null : null, format: (s.content_type as string | null) ?? null, date: a.slice(0, 10), startSec, endSec: hmToSec(b.slice(11, 16))! + endDay, people })
  }
  return { sessions, stages, timezone: tz, eventName: clean(ev?.name as string) }
}

type CueRow = { id: string; kind: Cue['kind']; session_id: string | null; track_id: string | null; day: string | null; fields: Fields | null; ack: Cue['ack']; hidden: boolean }
const toCue = (r: CueRow): Cue => ({ id: r.id, kind: r.kind, sessionId: r.session_id, trackId: r.track_id, day: r.day, fields: r.fields ?? {}, ack: r.ack, hidden: r.hidden })

/** Makes a cue for every agenda session (and an MC row before each one that has speakers) that does not have one yet. The first time a stage is built its rows are
    taken as accepted; sessions added after that arrive marked NEW. New rows start with the format's usual values and the MC already used that day. */
async function ensureCues(eventId: string, agenda: { sessions: AgendaSession[] }, cues: Cue[]): Promise<boolean> {
  const have = new Set(cues.filter(c => c.sessionId).map(c => `${c.sessionId}|${c.kind}`))
  const stageHasCues = new Set(cues.filter(c => c.kind === 'session').map(c => c.trackId ?? ''))
  const ordered = [...agenda.sessions].sort((a, b) => (a.date + String(a.startSec).padStart(6, '0')).localeCompare(b.date + String(b.startSec).padStart(6, '0')))
  const mcOf = new Map<string, string>()   // stage|day -> the MC last used there
  const sessionById = new Map(agenda.sessions.map(s => [s.id, s]))
  for (const c of cues) { const s = c.sessionId ? sessionById.get(c.sessionId) : null; const mc = c.fields.mc; if (s && mc) mcOf.set(`${s.trackId ?? ''}|${s.date}`, mc) }
  const inserts: Record<string, unknown>[] = []
  for (const s of ordered) {
    const key = `${s.trackId ?? ''}|${s.date}`
    const mc = mcOf.get(key)
    const withMc = (f: Fields): Fields => (mc ? { ...f, mc } : f)
    if (!have.has(`${s.id}|session`)) inserts.push({ event_id: eventId, track_id: s.trackId, kind: 'session', session_id: s.id, fields: withMc(defaultsFor('session', s.format, s.people.length)), ack: stageHasCues.has(s.trackId ?? '') ? null : ackOf(s) })
    if (s.people.length && !have.has(`${s.id}|mc`)) inserts.push({ event_id: eventId, track_id: s.trackId, kind: 'mc', session_id: s.id, fields: withMc(defaultsFor('mc', null, 0)), ack: null })
  }
  if (!inserts.length) return false
  const { error } = await supabaseAdmin.from('event_showcall_cues').upsert(inserts, { onConflict: 'session_id,kind', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return true
}

const MISSING = /event_showcall_cues|schema cache|does not exist/i
const friendly = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return MISSING.test(m) ? new Error('The Show Caller tables are not set up yet (database migration pending).') : e instanceof Error ? e : new Error(m) }

async function loadCues(eventId: string): Promise<Cue[]> {
  const { data, error } = await supabaseAdmin.from('event_showcall_cues').select('id, kind, session_id, track_id, day, fields, ack, hidden').eq('event_id', eventId)
  if (error) throw friendly(error)
  return (data as CueRow[] ?? []).map(toCue)
}

export async function loadSheet(eventId: string, trackId: string | null): Promise<SheetData> {
  const agenda = await loadAgenda(eventId)
  let cues = await loadCues(eventId)
  if (await ensureCues(eventId, agenda, cues).catch(e => { throw friendly(e) })) cues = await loadCues(eventId)
  const stages = trackId ? agenda.stages.filter(s => s.id === trackId) : agenda.stages
  let rows = buildRows({ sessions: agenda.sessions, cues, stages: agenda.stages })
  if (trackId) rows = rows.filter(r => r.trackId === trackId)
  return { event_name: agenda.eventName, timezone: agenda.timezone, stages, rows, server_time: new Date().toISOString() }
}

export type Action =
  | { action: 'set'; id: string; fields: Record<string, unknown> }
  | { action: 'accept'; id: string }
  | { action: 'delete'; id: string }
  | { action: 'add'; track_id: string; day: string; start: string; dur_sec?: number; type?: string }
  | { action: 'fill'; key: string; value: string; track_id: string | null; day: string; only_empty?: boolean }
  | { action: 'restore_mc'; track_id: string | null; day: string }

const MAX_LEN = 600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Runs one edit. `trackId` is the stage the caller's link is limited to (null = every stage). Returns an error message or null. */
export async function runAction(eventId: string, trackId: string | null, by: string, a: Action): Promise<{ error: string } | { ok: true }> {
  const own = async (id: string): Promise<Cue | null> => {
    if (!UUID.test(id ?? '')) return null
    const { data } = await supabaseAdmin.from('event_showcall_cues').select('id, kind, session_id, track_id, day, fields, ack, hidden').eq('id', id).eq('event_id', eventId).maybeSingle()
    const c = data ? toCue(data as CueRow) : null
    return c && (!trackId || c.trackId === trackId) ? c : null
  }
  const now = new Date().toISOString()
  try {
    if (a.action === 'set') {
      const c = await own(a.id); if (!c) return { error: 'Row not found.' }
      const allowed = editableKeys(c.kind)
      const fields = { ...c.fields }
      for (const [k, v] of Object.entries(a.fields ?? {})) {
        if (!allowed.includes(k)) return { error: `"${k}" comes from the Agenda and cannot be edited here.` }
        const val = String(v ?? '').trim().slice(0, MAX_LEN)
        if ((k === 'actual_start' || k === 'actual_end' || k === 'start') && val && hmToSec(val) === null) return { error: 'Use a time like 10:05 or 10:05:30.' }
        if (k === 'dur_sec' && val && !/^\d{1,5}$/.test(val)) return { error: 'Duration must be a number of seconds.' }
        if (val) fields[k] = val; else delete fields[k]
      }
      const { error } = await supabaseAdmin.from('event_showcall_cues').update({ fields, updated_at: now, updated_by: by }).eq('id', c.id)
      return error ? { error: error.message } : { ok: true }
    }
    if (a.action === 'accept') {
      const c = await own(a.id); if (!c) return { error: 'Row not found.' }
      if (c.kind !== 'session') return { ok: true }
      const agenda = await loadAgenda(eventId)
      const s = agenda.sessions.find(x => x.id === c.sessionId)
      const { error } = await supabaseAdmin.from('event_showcall_cues').update(s ? { ack: ackOf(s), updated_at: now, updated_by: by } : { hidden: true, updated_at: now, updated_by: by }).eq('id', c.id)   // a removed session's row is dismissed
      return error ? { error: error.message } : { ok: true }
    }
    if (a.action === 'delete') {
      const c = await own(a.id); if (!c) return { error: 'Row not found.' }
      if (c.kind === 'session') return { error: 'A session row comes from the Agenda; it can only be removed there.' }
      const { error } = c.kind === 'custom' ? await supabaseAdmin.from('event_showcall_cues').delete().eq('id', c.id) : await supabaseAdmin.from('event_showcall_cues').update({ hidden: true, updated_at: now, updated_by: by }).eq('id', c.id)
      return error ? { error: error.message } : { ok: true }
    }
    if (a.action === 'add') {
      if (!UUID.test(a.track_id ?? '') || (trackId && a.track_id !== trackId)) return { error: 'Choose a stage.' }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day ?? '') || hmToSec(a.start) === null) return { error: 'A day and a start time like 10:05 are needed.' }
      const { data: t } = await supabaseAdmin.from('event_agenda_tracks').select('id').eq('id', a.track_id).eq('event_id', eventId).maybeSingle()
      if (!t) return { error: 'Stage not found.' }
      const fields: Fields = { ...defaultsFor('custom', null, 0), start: a.start, dur_sec: String(Math.max(0, Math.min(86400, Math.round(a.dur_sec ?? 300)))), type: clean(a.type).slice(0, 80) || 'Custom cue' }
      const { error } = await supabaseAdmin.from('event_showcall_cues').insert({ event_id: eventId, track_id: a.track_id, day: a.day, kind: 'custom', fields, ack: null, updated_by: by })
      return error ? { error: error.message } : { ok: true }
    }
    if (a.action === 'fill' || a.action === 'restore_mc') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day ?? '')) return { error: 'Choose a day.' }
      const scopeTrack = trackId ?? a.track_id
      const agenda = await loadAgenda(eventId)
      const cues = await loadCues(eventId)
      if (a.action === 'restore_mc') {
        const sIds = new Set(agenda.sessions.filter(s => s.date === a.day && (s.trackId ?? null) === (scopeTrack ?? null)).map(s => s.id))
        const ids = cues.filter(c => c.kind === 'mc' && c.hidden && c.sessionId && sIds.has(c.sessionId)).map(c => c.id)
        if (ids.length) await supabaseAdmin.from('event_showcall_cues').update({ hidden: false, updated_at: now, updated_by: by }).in('id', ids).eq('event_id', eventId)
        return { ok: true }
      }
      if (!['mc', 'screen', 'live', 'mic', 'audio', 'lx', 'seats'].includes(a.key)) return { error: 'That column cannot be filled down.' }
      const rows = buildRows({ sessions: agenda.sessions, cues, stages: agenda.stages }).filter(r => r.flag !== 'removed' && r.date === a.day && (r.trackId ?? null) === (scopeTrack ?? null))
      const val = clean(a.value).slice(0, MAX_LEN)
      const byId = new Map(cues.map(c => [c.id, c]))
      const updates = rows.filter(r => !(a.only_empty && r.fields[a.key])).map(r => byId.get(r.id)!).filter(Boolean)
        .map(c => { const f = { ...c.fields }; if (val) f[a.key] = val; else delete f[a.key]; return { id: c.id, event_id: eventId, kind: c.kind, fields: f, updated_at: now, updated_by: by } })
      if (updates.length) { const { error } = await supabaseAdmin.from('event_showcall_cues').upsert(updates, { onConflict: 'id' }); if (error) return { error: error.message } }
      return { ok: true }
    }
    return { error: 'Unknown action.' }
  } catch (e) { return { error: friendly(e).message } }
}
