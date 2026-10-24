import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authBatch, initialCard, startResearch } from '@/app/lib/proposals/server'
import { matchTrack, normaliseRows, parseSpeakerSheet } from '@/app/lib/proposals/import'
import { cleanRow, normalizeUrl } from '@/app/lib/proposals/research'

/* POST — adds speakers to an existing drop, nothing is researched until Start research is pressed (or `start` is true).
     multipart { file }                     an Excel sheet: every row is added; if the event has no tracks yet its "Event Overview" sheet becomes them
     JSON { speaker: { name, designation?, company?, website?, country?, linkedin?, track_id?, extra? }, start? }    one speaker typed in by hand */
export const maxDuration = 60
const MAX_IN_BATCH = 120
const s200 = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '')

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'edit'); if ('error' in a) return a.error
  const eventId = a.batch.event_id
  const { count: have } = await supabaseAdmin.from('speaker_proposal_candidates').select('id', { count: 'exact', head: true }).eq('batch_id', id)
  const { data: last } = await supabaseAdmin.from('speaker_proposal_candidates').select('position').eq('batch_id', id).order('position', { ascending: false }).limit(1).maybeSingle()
  let position = (last?.position as number | undefined) ?? 0

  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null); const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the spreadsheet.' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'That spreadsheet is too large.' }, { status: 422 })
    let parsed: ReturnType<typeof parseSpeakerSheet>
    try { parsed = parseSpeakerSheet(Buffer.from(await file.arrayBuffer())) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the spreadsheet.' }, { status: 422 }) }
    if (!parsed.rows.length) return NextResponse.json({ error: 'No speakers found in the spreadsheet.' }, { status: 422 })
    if ((have ?? 0) + parsed.rows.length > MAX_IN_BATCH) return NextResponse.json({ error: `A drop can hold up to ${MAX_IN_BATCH} speakers.` }, { status: 422 })
    let { data: tracks } = await supabaseAdmin.from('speaker_proposal_tracks').select('id, name').eq('event_id', eventId).order('position')
    if (!tracks?.length && parsed.tracks.length) { const { data: ins } = await supabaseAdmin.from('speaker_proposal_tracks').insert(parsed.tracks.map(t => ({ event_id: eventId, ...t }))).select('id, name'); tracks = ins ?? [] }
    const inputs = await normaliseRows(parsed.rows)
    const rows = parsed.rows.map((r, i) => ({
      batch_id: id, event_id: eventId, position: ++position, raw: { cells: r.cells, extra: r.extra }, input: { ...inputs[i], track_text: r.cells.track ?? '' },
      track_id: matchTrack(r.cells.track ?? '', tracks ?? [])?.id ?? null, status: 'new', card: initialCard(inputs[i]),
    }))
    const { error } = await supabaseAdmin.from('speaker_proposal_candidates').insert(rows)
    if (error) return NextResponse.json({ error: 'Could not save the speakers.' }, { status: 500 })
    return NextResponse.json({ added: rows.length, unmatched_tracks: rows.filter(r => !r.track_id).length })
  }

  const b = await req.json().catch(() => null) as { speaker?: Record<string, unknown>; start?: boolean } | null
  const sp = b?.speaker
  if (!sp || !s200(sp.name)) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
  if ((have ?? 0) >= MAX_IN_BATCH) return NextResponse.json({ error: `A drop can hold up to ${MAX_IN_BATCH} speakers.` }, { status: 422 })
  if (sp.website && !normalizeUrl(s200(sp.website))) return NextResponse.json({ error: 'That website address doesn’t look right.' }, { status: 400 })
  let trackId: string | null = null
  if (typeof sp.track_id === 'string' && sp.track_id) { const { data: t } = await supabaseAdmin.from('speaker_proposal_tracks').select('id').eq('id', sp.track_id).eq('event_id', eventId).maybeSingle(); trackId = (t?.id as string | undefined) ?? null }
  const input = { ...cleanRow({ name: s200(sp.name), designation: s200(sp.designation), company: s200(sp.company), country: s200(sp.country), linkedin: s200(sp.linkedin), website: s200(sp.website), extra: typeof sp.extra === 'string' ? sp.extra.slice(0, 12000) : null }), track_text: '' }
  const { data: row, error } = await supabaseAdmin.from('speaker_proposal_candidates').insert({ batch_id: id, event_id: eventId, position: position + 1, raw: { cells: {}, extra: [], manual: true }, input, track_id: trackId, status: 'new', card: initialCard(input) }).select('id').single()
  if (error || !row) return NextResponse.json({ error: 'Could not add the speaker.' }, { status: 500 })
  if (b?.start) await startResearch(id, [row.id as string])
  return NextResponse.json({ added: 1, id: row.id })
}
