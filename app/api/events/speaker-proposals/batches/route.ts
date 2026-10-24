import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { initialCard, requireProposalAccess } from '@/app/lib/proposals/server'
import { matchTrack, normaliseRows, parseSpeakerSheet } from '@/app/lib/proposals/import'

/* GET  ?event_id=  → the event's batches with counts
   POST multipart { event_id, name, file }  → reads the spreadsheet, tidies the rows, creates the batch and its candidates (research starts separately). The first import also stores the event's tracks from the overview sheet. */
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireProposalAccess(req, eventId, 'view'); if ('error' in a) return a.error
  const { data: batches } = await supabaseAdmin.from('speaker_proposal_batches').select('id, name, status, source_filename, created_at').eq('event_id', eventId).order('created_at', { ascending: false })
  const { data: cands } = await supabaseAdmin.from('speaker_proposal_candidates').select('batch_id, status, review_state').eq('event_id', eventId)
  const out = (batches ?? []).map(b => {
    const mine = (cands ?? []).filter(c => c.batch_id === b.id)
    return { ...b, total: mine.length, researched: mine.filter(c => c.status === 'researched').length, ready: mine.filter(c => c.review_state === 'ready').length, excluded: mine.filter(c => c.review_state === 'excluded').length }
  })
  return NextResponse.json({ batches: out })
}

export async function POST(req: NextRequest) {
  // JSON { event_id, name } creates an empty drop (the normal way: name it, then add speakers inside it).
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const b = await req.json().catch(() => null) as { event_id?: string; name?: string } | null
    if (!b?.event_id || !b.name?.trim()) return NextResponse.json({ error: 'event_id and a name are required' }, { status: 400 })
    const a = await requireProposalAccess(req, b.event_id, 'edit'); if ('error' in a) return a.error
    const { data, error } = await supabaseAdmin.from('speaker_proposal_batches').insert({ event_id: b.event_id, name: b.name.trim().slice(0, 80), created_by: a.session.sid ?? null }).select('id').single()
    if (error || !data) return NextResponse.json({ error: 'Could not create the drop.' }, { status: 500 })
    return NextResponse.json({ id: data.id })
  }
  const form = await req.formData().catch(() => null)
  const eventId = String(form?.get('event_id') ?? ''), name = String(form?.get('name') ?? '').trim(), file = form?.get('file')
  if (!eventId || !name || !(file instanceof File)) return NextResponse.json({ error: 'event_id, a batch name and the spreadsheet are required' }, { status: 400 })
  const a = await requireProposalAccess(req, eventId, 'edit'); if ('error' in a) return a.error
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'That spreadsheet is too large.' }, { status: 422 })

  let parsed: ReturnType<typeof parseSpeakerSheet>
  try { parsed = parseSpeakerSheet(Buffer.from(await file.arrayBuffer())) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the spreadsheet.' }, { status: 422 }) }
  if (!parsed.rows.length) return NextResponse.json({ error: 'No speakers found in the spreadsheet.' }, { status: 422 })
  if (parsed.rows.length > 80) return NextResponse.json({ error: 'A batch can hold up to 80 speakers.' }, { status: 422 })

  // Tracks come from the overview sheet, once per event (never overwritten by a later upload).
  let { data: tracks } = await supabaseAdmin.from('speaker_proposal_tracks').select('id, name').eq('event_id', eventId).order('position')
  if (!tracks?.length && parsed.tracks.length) {
    const { data: inserted } = await supabaseAdmin.from('speaker_proposal_tracks').insert(parsed.tracks.map(t => ({ event_id: eventId, ...t }))).select('id, name')
    tracks = inserted ?? []
  }
  const inputs = await normaliseRows(parsed.rows)
  const { data: batch, error } = await supabaseAdmin.from('speaker_proposal_batches').insert({ event_id: eventId, name, source_filename: file.name, created_by: a.session.sid ?? null }).select('id').single()
  if (error || !batch) return NextResponse.json({ error: 'Could not create the batch.' }, { status: 500 })
  const rows = parsed.rows.map((r, i) => ({
    batch_id: batch.id, event_id: eventId, position: r.position, raw: { cells: r.cells, extra: r.extra },
    input: { ...inputs[i], track_text: r.cells.track ?? '' }, track_id: matchTrack(r.cells.track ?? '', tracks ?? [])?.id ?? null,
    card: initialCard(inputs[i]),
  }))
  const { error: e2 } = await supabaseAdmin.from('speaker_proposal_candidates').insert(rows)
  if (e2) { await supabaseAdmin.from('speaker_proposal_batches').delete().eq('id', batch.id); return NextResponse.json({ error: 'Could not save the speakers.' }, { status: 500 }) }
  return NextResponse.json({ id: batch.id, speakers: rows.length, tracks: tracks?.length ?? 0, unmatched_tracks: rows.filter(r => !r.track_id).length })
}
