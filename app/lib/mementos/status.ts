import { supabaseAdmin } from '@/app/lib/supabase'

// Per-speaker memento status — derived from batch membership and the batch's hand-off; nothing is stored on the speaker.
//   not_shared    — in no batch
//   in_batch      — in a batch that has not been pushed to Ops yet (draft)
//   pushed        — pushed to Ops (a "before EventPilot" entry also counts as pushed)
//   with_vendor   — Ops sent it to the memento vendor
//   downloaded    — the vendor downloaded the photos
//   confirmed     — the vendor confirmed the photos look good
//   issue         — the vendor reported a problem
//   photo_changed — pushed or later, but the Cleaned Photo was replaced afterwards, so what Ops/the vendor has is out of date
import { type MementoState, MEMENTO_STATE_LABEL } from './state-labels'
export { type MementoState, MEMENTO_STATE_LABEL }
export type MementoStatus = { state: MementoState; batch_id: string | null; batch_name: string | null; shared_at: string | null; legacy: boolean }

const FROM_DISPATCH: Record<string, MementoState> = { requested: 'pushed', sent: 'with_vendor', downloaded: 'downloaded', confirmed: 'confirmed', issue: 'issue' }

export function mementoStateOf(item: { photo_url: string | null; kind: string; status: string; dispatch?: string | null } | null, currentPhoto: string | null): MementoState {
  if (!item) return 'not_shared'
  if (item.status === 'draft') return 'in_batch'
  if (item.kind !== 'legacy' && item.photo_url && item.photo_url !== currentPhoto) return 'photo_changed'
  return FROM_DISPATCH[item.dispatch ?? ''] ?? 'pushed'
}

export async function getMementoStatuses(eventId: string): Promise<Map<string, MementoStatus>> {
  const [{ data: items }, { data: speakers }] = await Promise.all([
    supabaseAdmin.from('memento_batch_items').select('speaker_id, photo_url, batch:memento_batches!inner(id, name, kind, status, shared_at, event_id)').eq('batch.event_id', eventId),
    supabaseAdmin.from('event_speakers').select('id, photo_processed_url').eq('event_id', eventId),
  ])
  const photoOf = new Map((speakers ?? []).map(s => [s.id as string, (s.photo_processed_url as string | null) ?? null]))
  type Row = { speaker_id: string; photo_url: string | null; batch: { id: string; name: string; kind: string; status: string; shared_at: string } }
  // A speaker can be in several batches; the most recent one decides.
  const latest = new Map<string, Row>()
  for (const row of (items ?? []) as unknown as Row[]) {
    const prev = latest.get(row.speaker_id)
    if (!prev || row.batch.shared_at > prev.batch.shared_at) latest.set(row.speaker_id, row)
  }
  const batchIds = [...new Set([...latest.values()].map(r => r.batch.id))]
  const { data: dispatches } = batchIds.length
    ? await supabaseAdmin.from('memento_dispatches').select('batch_id, status, requested_at').in('batch_id', batchIds).neq('status', 'revoked').order('requested_at', { ascending: false })
    : { data: [] as { batch_id: string; status: string; requested_at: string }[] }
  const dispatchOf = new Map<string, string>()
  for (const d of dispatches ?? []) if (!dispatchOf.has(d.batch_id as string)) dispatchOf.set(d.batch_id as string, d.status as string)

  const out = new Map<string, MementoStatus>()
  for (const [speakerId, r] of latest) {
    out.set(speakerId, {
      state: mementoStateOf({ photo_url: r.photo_url, kind: r.batch.kind, status: r.batch.status, dispatch: dispatchOf.get(r.batch.id) ?? null }, photoOf.get(speakerId) ?? null),
      batch_id: r.batch.id, batch_name: r.batch.name, shared_at: r.batch.shared_at, legacy: r.batch.kind === 'legacy',
    })
  }
  return out
}
