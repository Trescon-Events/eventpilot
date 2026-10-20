import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { knownStaffId } from '@/app/lib/badges/service'
import { requireMementoAccess } from '@/app/lib/mementos/access'
import { matchNames } from '@/app/lib/mementos/match-names'
import { getMementoStatuses } from '@/app/lib/mementos/status'

/* POST { event_id, names: string[], shared_at: 'YYYY-MM-DD', name?, dry_run? }
   The producers' list of speakers whose photos were shared with Ops BEFORE this module existed (BSS, 2026-10-20). Names are matched to the
   event's speakers (see match-names.ts); dry_run returns matched / ambiguous / unmatched and writes nothing. Without dry_run it records ONE
   batch of kind 'legacy' (already pushed) with the matched, not-yet-tracked speakers, dated shared_at. A one-time manual mark — not a sync, and it never
   touches the photos themselves. Ambiguous and unmatched names are left for the producer to fix and resubmit. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; names?: string[]; shared_at?: string; name?: string; dry_run?: boolean } | null
  if (!body?.event_id || !Array.isArray(body.names) || body.names.length === 0) return NextResponse.json({ error: 'event_id and a list of names are required.' }, { status: 400 })
  if (body.names.length > 1000) return NextResponse.json({ error: 'At most 1000 names at a time.' }, { status: 400 })
  const auth = await requireMementoAccess(req, body.event_id, 'edit')
  if ('error' in auth) return auth.error
  const sharedAt = body.shared_at && /^\d{4}-\d{2}-\d{2}$/.test(body.shared_at) ? `${body.shared_at}T12:00:00Z` : null
  if (!sharedAt) return NextResponse.json({ error: 'Give the date these photos were shared (YYYY-MM-DD).' }, { status: 400 })

  const names = [...new Set(body.names.map(n => n.trim()).filter(Boolean))]
  const { data: speakers } = await supabaseAdmin.from('event_speakers').select('id, name, public_name').eq('event_id', body.event_id).eq('active', true)
  const matches = matchNames(names, (speakers ?? []) as { id: string; name: string; public_name: string | null }[])
  const tracked = await getMementoStatuses(body.event_id)
  const toRecord = matches.filter(m => m.status === 'matched' && !tracked.has(m.speaker_id!))
  const alreadyTracked = matches.filter(m => m.status === 'matched' && tracked.has(m.speaker_id!)).map(m => m.speaker_name!)
  const summary = {
    matched: matches.filter(m => m.status === 'matched').map(m => ({ input: m.input, speaker: m.speaker_name })),
    unmatched: matches.filter(m => m.status === 'unmatched').map(m => m.input),
    ambiguous: matches.filter(m => m.status === 'ambiguous').map(m => ({ input: m.input, candidates: m.candidates })),
    already_tracked: alreadyTracked,
    will_record: toRecord.length,
  }
  if (body.dry_run) return NextResponse.json({ dry_run: true, ...summary })
  if (toRecord.length === 0) return NextResponse.json({ error: 'Nothing new to record — every matched speaker is already tracked, or no names matched.', ...summary }, { status: 422 })

  const { data: batch, error } = await supabaseAdmin.from('memento_batches')
    .insert({ event_id: body.event_id, name: body.name?.trim() || 'Shared before EventPilot', kind: 'legacy', status: 'pushed', shared_at: sharedAt, pushed_at: sharedAt, created_by: await knownStaffId(auth.session.sid) }).select('id').single()
  if (error || !batch) return NextResponse.json({ error: error?.message ?? 'Could not record the list.' }, { status: 500 })
  const { error: itemsErr } = await supabaseAdmin.from('memento_batch_items').insert(toRecord.map(m => ({ batch_id: batch.id, speaker_id: m.speaker_id, speaker_name: m.speaker_name, photo_url: null })))
  if (itemsErr) {
    await supabaseAdmin.from('memento_batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }
  return NextResponse.json({ recorded: toRecord.length, batch_id: batch.id, ...summary })
}
