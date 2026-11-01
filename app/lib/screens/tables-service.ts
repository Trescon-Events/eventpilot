import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { Zip, ZipPassThrough } from 'fflate'
import { supabaseAdmin } from '@/app/lib/supabase'
import { compositeAnnouncement, layersForRole, type Variant } from '@/app/lib/announcements/composite'
import { loadScreenSessions } from './data'
import { buildTableSnap, evaluateTableChanges, type RemovedRow, type TableChangeRow, type TableSnap } from './table-changes'
import { DEFAULT_TABLE_COUNT, MAX_TABLES, allCardsZipName, seatFileName, sessionFolderName, standbyFileName, tableFileName, tablesZipName, withModeratorFallback } from './tables'

/* Table Screens (Phase 1) — what the console shows and downloads. The Table Screen templates are built by the branding team in the template editor (Admin Console › Variants ›
   New Variant › Table Screen); a session's speakers come from the same place as Stage Screens (agenda + speaker records + the producers' per-session name edits), so a correction made there
   shows here too. Cards are drawn on request (they are small and quick), never stored. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_SEATS = 12

export type TableTemplateInfo = { id: string; name: string; width: number; height: number; standby: boolean; version: string }
export type TableSessionInfo = { id: string; topic: string; date: string; startHM: string; endHM: string; stage: string | null; seats: { speakerId: string; name: string; moderator: boolean }[] }

export async function tableVariants(eventId: string): Promise<Variant[]> {
  const { data: ev } = await supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle()
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? [])
  return all.filter(v => v.category === 'table_screen')
}

/** The speaker card to use (the one asked for, else the first), and the standby screen (the one asked for, else the first marked standby). */
export function pickTemplates(variants: Variant[], templateId: string | null, standbyId: string | null): { card: Variant | null; standby: Variant | null } {
  const cards = variants.filter(v => !v.table_standby), standbys = variants.filter(v => v.table_standby)
  return { card: cards.find(v => v.id === templateId) ?? cards[0] ?? null, standby: standbys.find(v => v.id === standbyId) ?? standbys[0] ?? null }
}

/** The design a download used, as "id@version"; the first card design when none was asked for. */
export const lookOf = (templates: TableTemplateInfo[], templateId?: string | null): string => {
  const cards = templates.filter(t => !t.standby), t = cards.find(c => c.id === templateId) ?? cards[0]
  return t ? `${t.id}@${t.version}` : ''
}

export type TableChanges = { baseline_at: string | null; by_session: Record<string, TableChangeRow>; removed: RemovedRow[] }

/** What the technician's link downloaded, per session. */
async function downloadRows(linkId: string) {
  const { data } = await supabaseAdmin.from('event_screen_link_downloads').select('session_id, snapshot, downloaded_at').eq('link_id', linkId)
  return (data ?? []).filter(r => r.snapshot && Array.isArray((r.snapshot as TableSnap).seats))
}
export async function tableDownloads(linkId: string): Promise<Map<string, TableSnap>> {
  return new Map((await downloadRows(linkId)).map(r => [r.session_id as string, r.snapshot as TableSnap]))
}

/** Remembers what the technician's link downloaded (the first one starts the baseline, like the Stage Screens). Best effort: a failure here never blocks the download. */
export async function recordTableDownloads(linkId: string, sessions: TableSessionInfo[], look: string, via: TableSnap['via'] | ((s: TableSessionInfo) => TableSnap['via'])): Promise<void> {
  if (!sessions.length) return
  try {
    const now = new Date().toISOString()
    await supabaseAdmin.from('event_screen_link_downloads').upsert(sessions.map(s => ({
      link_id: linkId, session_id: s.id, version_key: `tables|${typeof via === 'function' ? via(s) : via}|${look}`, downloaded_at: now, snapshot: buildTableSnap(s, look, typeof via === 'function' ? via(s) : via),
    })), { onConflict: 'link_id,session_id' })
    await supabaseAdmin.from('event_screen_links').update({ baseline_at: now }).eq('id', linkId).is('baseline_at', null)
  } catch (e) { console.error('[table-downloads] could not record:', e instanceof Error ? e.message : e) }
}

export function changesFor(payload: { templates: TableTemplateInfo[]; sessions: TableSessionInfo[] }, downloads: Map<string, TableSnap>): Omit<TableChanges, 'baseline_at'> {
  return evaluateTableChanges({
    sessions: payload.sessions.map(s => ({ ...s })), downloads, currentLook: lookOf(payload.templates),
    liveLookFor: prev => { const id = prev.split('@')[0]; const t = payload.templates.find(x => x.id === id && !x.standby); return t ? `${t.id}@${t.version}` : null },
  })
}

/** The newest technician link of an event that has not been switched off (the producers' page compares with what that link downloaded). */
export async function activeTablesLink(eventId: string): Promise<{ id: string; label: string; baseline_at: string | null } | null> {
  const { data } = await supabaseAdmin.from('event_screen_links').select('id, label, baseline_at').eq('event_id', eventId).eq('kind', 'tables').is('revoked_at', null).order('created_at', { ascending: false }).limit(1)
  const r = data?.[0]
  return r ? { id: r.id as string, label: r.label as string, baseline_at: (r.baseline_at as string | null) ?? null } : null
}

export async function tablesPayload(eventId: string, trackId: string | null, linkId?: string | null) {
  const [variants, { sessions, timezone }] = await Promise.all([tableVariants(eventId), loadScreenSessions(eventId, { trackId })])
  const templates: TableTemplateInfo[] = variants.map(v => ({ id: v.id, name: v.name || (v.table_standby ? 'Standby screen' : 'Table card'), width: v.canvas_width, height: v.canvas_height, standby: !!v.table_standby, version: createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 10) }))   // changes whenever the template is edited, so a preview is never the old design
  const list: TableSessionInfo[] = sessions.map(s => ({
    id: s.id, topic: s.topic, date: s.date, startHM: s.startHM, endHM: s.endHM, stage: s.stage,
    seats: s.cards.map(c => ({ speakerId: c.speakerId, name: c.text.name, moderator: c.moderator })),   // moderator first, then the order on the session screen — the order they sit in
  }))
  let changes: TableChanges | null = null
  if (linkId) {
    const [rows, { data: l }] = await Promise.all([downloadRows(linkId), supabaseAdmin.from('event_screen_links').select('baseline_at').eq('id', linkId).maybeSingle()])
    const downloads = new Map(rows.map(r => [r.session_id as string, r.snapshot as TableSnap]))
    changes = { baseline_at: (l?.baseline_at as string | null) ?? null, ...changesFor({ templates, sessions: list }, downloads) }
    for (const r of rows) { const c = changes.by_session[r.session_id as string]; if (c) c.downloaded_at = r.downloaded_at as string }
  }
  return { timezone, table_count: DEFAULT_TABLE_COUNT, max_tables: MAX_TABLES, templates, sessions: list, changes }
}

/** One card as a PNG at the template's own size (or scaled down for previews). A standby variant has no person on it. */
export async function drawTableCard(variant: Variant, person: { name: string; moderator: boolean } | null, scale = 1): Promise<Buffer> {
  const v = layersForRole(withModeratorFallback(variant, !!person?.moderator), !!person?.moderator)
  const full = await compositeAnnouncement(v, {}, { name: person?.name ?? '' }, { showReferenceLayers: false })
  if (scale >= 1) return full
  return sharp(full).resize(Math.max(40, Math.round(variant.canvas_width * scale))).png().toBuffer()
}

const clampName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 120) : '')

/** GET …/card?template=…&name=…&moderator=1&scale=0.25 | &standby=1 — a PNG for an <img> preview or a single download. */
export async function cardResponse(variants: Variant[], q: URLSearchParams): Promise<NextResponse> {
  const standby = q.get('standby') === '1'
  const { card, standby: sb } = pickTemplates(variants, q.get('template'), q.get('template'))
  const variant = standby ? sb : card
  if (!variant) return NextResponse.json({ error: standby ? 'No standby screen template has been made yet.' : 'No Table Screen template has been made yet.' }, { status: 404 })
  const name = clampName(q.get('name'))
  if (!standby && !name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const scale = Math.min(1, Math.max(0.05, parseFloat(q.get('scale') ?? '1') || 1))
  try {
    const buffer = await drawTableCard(variant, standby ? null : { name, moderator: q.get('moderator') === '1' }, scale)
    const headers: Record<string, string> = { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=30' }
    if (q.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="${(q.get('file') ?? 'card.png').replace(/[^\w.-]+/g, '_')}"`
    return new NextResponse(new Uint8Array(buffer), { headers })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not draw the card.' }, { status: 500 }) }
}

export type ZipRequest = { template?: string; standby_template?: string; session?: { date?: string; startHM?: string; topic?: string }; seats?: { name?: unknown; moderator?: unknown; table?: unknown }[]; include_standby?: boolean }

/** POST …/zip — one PNG per seat that has a table (named Table4_Seat1_Moderator_Name.png), plus Standby.png, as one zip. */
export async function zipResponse(variants: Variant[], body: ZipRequest, tableCount: number): Promise<NextResponse> {
  const { card, standby } = pickTemplates(variants, body.template ?? null, body.standby_template ?? null)
  if (!card) return NextResponse.json({ error: 'No Table Screen template has been made yet.' }, { status: 404 })
  const seats = (Array.isArray(body.seats) ? body.seats : []).slice(0, MAX_SEATS).map((s, i) => ({ seat: i + 1, name: clampName(s.name), moderator: s.moderator === true, table: typeof s.table === 'number' ? Math.trunc(s.table) : null }))
  const ready = seats.filter(s => s.name && s.table !== null)
  const bad = ready.find(s => s.table! < 1 || s.table! > tableCount)
  if (bad) return NextResponse.json({ error: `Table ${bad.table} does not exist.` }, { status: 400 })
  const used = ready.map(s => s.table)
  if (new Set(used).size !== used.length) return NextResponse.json({ error: 'A table is used for two seats.' }, { status: 400 })
  const wantStandby = body.include_standby !== false && !!standby
  if (!ready.length && !wantStandby) return NextResponse.json({ error: 'Nothing to download yet: give the seats their tables first.' }, { status: 400 })

  const when = { date: /^\d{4}-\d{2}-\d{2}$/.test(body.session?.date ?? '') ? body.session!.date! : 'session', startHM: /^\d{2}:\d{2}$/.test(body.session?.startHM ?? '') ? body.session!.startHM! : '0000', topic: clampName(body.session?.topic) || 'table-screens' }
  const filename = tablesZipName(when)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const zip = new Zip((err, chunk, final) => { if (err) controller.error(err); else { controller.enqueue(chunk); if (final) controller.close() } })
        const add = async (name: string, draw: () => Promise<Buffer>) => { const f = new ZipPassThrough(name); zip.add(f); f.push(new Uint8Array(await draw()), true) }   // PNGs are already compressed
        for (const s of [...ready].sort((a, b) => a.table! - b.table!)) await add(tableFileName({ table: s.table!, seat: s.seat, moderator: s.moderator, name: s.name }), () => drawTableCard(card, { name: s.name, moderator: s.moderator }))
        if (wantStandby && standby) await add(standbyFileName(), () => drawTableCard(standby, null))
        zip.end()
      } catch (e) { controller.error(e) }
    },
  })
  return new NextResponse(stream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}

export const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v)

export type AllCardsRequest = { template?: string; standby_template?: string; date?: string | null; stage?: string | null; session_id?: string | null; changed_only?: boolean }

/** POST …/cards — every speaker card of the chosen sessions in one zip, named by seat (no table numbers: those are decided on the day). `session_id` = that one session (flat files);
    otherwise every session of the chosen day (or all days, one folder per day) and stage, one folder per session, plus Standby.png. Cards of a speaker who appears in many sessions are drawn once and reused. */
export async function allCardsResponse(eventId: string, body: AllCardsRequest, link?: { id: string }): Promise<NextResponse> {
  const [variants, payload] = await Promise.all([tableVariants(eventId), tablesPayload(eventId, null)])
  const { card, standby } = pickTemplates(variants, body.template ?? null, body.standby_template ?? null)
  if (!card) return NextResponse.json({ error: 'No Table Screen template has been made yet.' }, { status: 404 })
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : null
  const stage = typeof body.stage === 'string' && body.stage ? body.stage : null
  const one = isUuid(body.session_id) ? body.session_id : null
  // "Changed cards only": the sessions whose cards differ from what this technician link last downloaded, or that were added since, plus a CHANGES.txt saying what and why.
  let changedNote: string | null = null
  let changedIds: Set<string> | null = null
  const had = link ? await tableDownloads(link.id) : new Map<string, TableSnap>()
  const prevVia = new Map<string, TableSnap['via']>([...had].map(([id, d]) => [id, d.via]))   // a re-download keeps how the session was first covered
  if (body.changed_only) {
    if (!link) return NextResponse.json({ error: 'Changed-only downloads are for the technician link.' }, { status: 400 })
    const ch = changesFor(payload, had)
    changedIds = new Set(Object.entries(ch.by_session).filter(([, r]) => r.status === 'changed' || r.status === 'new').map(([id]) => id))
    const lines = payload.sessions.filter(s => changedIds!.has(s.id)).sort((a, b) => (a.date + a.startHM).localeCompare(b.date + b.startHM))
      .map(s => `${s.date} ${s.startHM} ${s.stage ?? ''} - ${s.topic}\r\n   ${ch.by_session[s.id].reasons.join('\r\n   ') || 'Changed'}`)
    const gone = ch.removed.map(r => `${r.date} ${r.startHM} ${r.stage} - ${r.topic}\r\n   No longer in the agenda (or has no speakers): delete its cards`)
    changedNote = ['CARDS THAT CHANGED SINCE YOUR LAST DOWNLOAD', '', ...lines, ...(gone.length ? ['', 'REMOVED', '', ...gone] : []), ''].join('\r\n')
    if (!changedIds.size && !gone.length) return NextResponse.json({ error: 'Nothing has changed since your last download.' }, { status: 400 })
  }
  const sessions = payload.sessions
    .filter(s => s.seats.length && (changedIds ? changedIds.has(s.id) : one ? s.id === one : (!date || s.date === date) && (!stage || s.stage === stage)))
    .sort((a, b) => (a.date + a.startHM).localeCompare(b.date + b.startHM))
  if (!sessions.length && !changedNote) return NextResponse.json({ error: 'No sessions with speakers for that choice.' }, { status: 400 })
  const multiDay = new Set(sessions.map(s => s.date)).size > 1
  const filename = changedIds ? `Cards_CHANGED_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.zip` : one ? tablesZipName(sessions[0]).replace(/^Tables_/, 'Cards_') : allCardsZipName({ date, stage })
  if (link) void recordTableDownloads(link.id, sessions, lookOf(payload.templates, body.template), changedIds ? (x => prevVia.get(x.id) ?? 'bulk') : one ? (x => prevVia.get(x.id) ?? 'session') : 'bulk')   // what this link now has
  const drawn = new Map<string, Promise<Uint8Array>>()
  const draw = (name: string, moderator: boolean) => {
    const key = `${moderator ? 1 : 0}|${name}`
    if (!drawn.has(key)) drawn.set(key, drawTableCard(card, { name, moderator }).then(b => new Uint8Array(b)))
    return drawn.get(key)!
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const zip = new Zip((err, chunk, final) => { if (err) controller.error(err); else { controller.enqueue(chunk); if (final) controller.close() } })
        const add = async (name: string, bytes: Promise<Uint8Array>) => { const f = new ZipPassThrough(name); zip.add(f); f.push(await bytes, true) }   // PNGs are already compressed
        for (const s of sessions) {
          const dir = one && !changedIds ? '' : `${multiDay ? `${s.date}/` : ''}${sessionFolderName(s, false)}/`   // several days: a folder per day, then one per session
          for (const [i, seat] of s.seats.slice(0, MAX_SEATS).entries()) {
            const name = clampName(seat.name); if (!name) continue
            await add(dir + seatFileName({ seat: i + 1, moderator: seat.moderator, name }), draw(name, seat.moderator))
          }
        }
        if (changedNote) await add('CHANGES.txt', Promise.resolve(new TextEncoder().encode(changedNote)))
        if (standby && !one && !changedIds) await add(standbyFileName(), drawTableCard(standby, null).then(b => new Uint8Array(b)))
        zip.end()
      } catch (e) { controller.error(e) }
    },
  })
  return new NextResponse(stream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}
