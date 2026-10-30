import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { Zip, ZipPassThrough } from 'fflate'
import { supabaseAdmin } from '@/app/lib/supabase'
import { compositeAnnouncement, layersForRole, type Variant } from '@/app/lib/announcements/composite'
import { loadScreenSessions } from './data'
import { DEFAULT_TABLE_COUNT, MAX_TABLES, standbyFileName, tableFileName, tablesZipName } from './tables'

/* Table Screens (Phase 1) — what the console shows and downloads. The Table Screen templates are built by the branding team in the template editor (Admin Console › Variants ›
   New Variant › Table Screen); a session's speakers come from the same place as Stage Screens (agenda + speaker records + the producers' per-session name edits), so a correction made there
   shows here too. Cards are drawn on request (they are small and quick), never stored. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_SEATS = 12

export type TableTemplateInfo = { id: string; name: string; width: number; height: number; standby: boolean }
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

export async function tablesPayload(eventId: string, trackId: string | null) {
  const [variants, { sessions, timezone }] = await Promise.all([tableVariants(eventId), loadScreenSessions(eventId, { trackId })])
  const templates: TableTemplateInfo[] = variants.map(v => ({ id: v.id, name: v.name || (v.table_standby ? 'Standby screen' : 'Table card'), width: v.canvas_width, height: v.canvas_height, standby: !!v.table_standby }))
  const list: TableSessionInfo[] = sessions.map(s => ({
    id: s.id, topic: s.topic, date: s.date, startHM: s.startHM, endHM: s.endHM, stage: s.stage,
    seats: s.cards.map(c => ({ speakerId: c.speakerId, name: c.text.name, moderator: c.moderator })),   // moderator first, then the order on the session screen — the order they sit in
  }))
  return { timezone, table_count: DEFAULT_TABLE_COUNT, max_tables: MAX_TABLES, templates, sessions: list }
}

/** One card as a PNG at the template's own size (or scaled down for previews). A standby variant has no person on it. */
export async function drawTableCard(variant: Variant, person: { name: string; moderator: boolean } | null, scale = 1): Promise<Buffer> {
  const v = layersForRole(variant, !!person?.moderator)
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
