import { supabaseAdmin } from '@/app/lib/supabase'

/** Furthest badge state per speaker across this event's batches: created -> sent (to the printer) -> printed. */
export async function speakerBadgeStatus(eventId: string, column: 'speaker_id' | 'vip_id' = 'speaker_id'): Promise<Map<string, 'created' | 'sent' | 'printed'>> {
  const { data: batches } = await supabaseAdmin.from('badge_batches').select('id').eq('event_id', eventId)
  const ids = (batches ?? []).map(b => b.id as string)
  const out = new Map<string, 'created' | 'sent' | 'printed'>()
  if (!ids.length) return out
  const [{ data: items }, { data: dispatches }] = await Promise.all([
    supabaseAdmin.from('badge_batch_items').select(`batch_id, ${column}`).in('batch_id', ids).eq('removed', false).not(column, 'is', null),
    supabaseAdmin.from('badge_print_dispatches').select('batch_id, status').in('batch_id', ids).in('status', ['sent', 'downloaded', 'printed']),
  ])
  const rank = { created: 1, sent: 2, printed: 3 } as const
  const batchState = new Map<string, 'sent' | 'printed'>()
  for (const d of dispatches ?? []) {
    const st = d.status === 'printed' ? 'printed' : 'sent'
    const cur = batchState.get(d.batch_id as string)
    if (!cur || rank[st] > rank[cur]) batchState.set(d.batch_id as string, st)
  }
  for (const it of (items ?? []) as unknown as Array<Record<string, string>>) {
    const st = batchState.get(it.batch_id) ?? 'created'
    const cur = out.get(it[column])
    if (!cur || rank[st] > rank[cur]) out.set(it[column], st)
  }
  return out
}

