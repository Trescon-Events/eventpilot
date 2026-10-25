import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { initialCard, requireProposalAccess } from '@/app/lib/proposals/server'
import { MAX_CO_OWNERS, eligibleTeam, isStaffId } from '@/app/lib/proposals/owners'
import { notifyStaff } from '@/app/lib/notify'
import { randomBytes } from 'crypto'
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
    const b = await req.json().catch(() => null) as { event_id?: string; name?: string; owner_sid?: string; co_owner_sids?: string[]; approver_ids?: string[] } | null
    if (!b?.event_id || !b.name?.trim()) return NextResponse.json({ error: 'event_id and a name are required' }, { status: 400 })
    const a = await requireProposalAccess(req, b.event_id, 'edit'); if ('error' in a) return a.error
    // The owner is required (they send the client emails and get the notifications); co-owners and approvers are optional and can be changed inside the drop.
    const team = new Set((await eligibleTeam(b.event_id)).map(p => p.sid))
    if (!isStaffId(b.owner_sid) || !team.has(b.owner_sid)) return NextResponse.json({ error: 'Choose an owner for this drop — one of the event’s producers.' }, { status: 400 })
    const co = [...new Set(b.co_owner_sids ?? [])].filter(s => s !== b.owner_sid)
    if (co.some(s => !isStaffId(s) || !team.has(s)) || co.length > MAX_CO_OWNERS) return NextResponse.json({ error: 'Co-owners must be producers of this event.' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('speaker_proposal_batches').insert({ event_id: b.event_id, name: b.name.trim().slice(0, 80), created_by: a.session.sid ?? null, owner_sid: b.owner_sid, co_owner_sids: co }).select('id').single()
    if (error || !data) return NextResponse.json({ error: 'Could not create the drop.' }, { status: 500 })
    const ids = [...new Set(b.approver_ids ?? [])].filter(isStaffId)
    if (ids.length) {
      const { data: picked } = await supabaseAdmin.from('speaker_proposal_approvers').select('name, email').eq('event_id', b.event_id).in('id', ids)
      if (picked?.length) await supabaseAdmin.from('speaker_proposal_reviewers').insert(picked.slice(0, 6).map(p => ({ batch_id: data.id, name: p.name, email: p.email, token: randomBytes(24).toString('hex') })))
    }
    const me = isStaffId(a.session.sid) ? a.session.sid : null
    const hear = [b.owner_sid, ...co].filter(s => s !== me)
    if (hear.length) await notifyStaff(hear, { type: 'speaker_proposal_owner', title: `You were added to the new drop “${b.name.trim().slice(0, 80)}”`, body: b.owner_sid === me ? '' : 'You are the owner or a co-owner: client emails go out from the owner’s mailbox, and everyone is copied.', link: `/admin/events/${b.event_id}/stakeholders/speaker-proposals/${data.id}`, eventId: b.event_id }).catch(() => {})
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
  const { data: batch, error } = await supabaseAdmin.from('speaker_proposal_batches').insert({ event_id: eventId, name, source_filename: file.name, created_by: a.session.sid ?? null, owner_sid: isStaffId(a.session.sid) ? a.session.sid : null }).select('id').single()
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
