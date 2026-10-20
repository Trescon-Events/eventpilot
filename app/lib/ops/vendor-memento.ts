import { supabaseAdmin } from '@/app/lib/supabase'
import { VENDOR_MEMENTO_VISIBLE, type MementoDispatchRow } from '@/app/lib/mementos/dispatch'

/* The ONLY way vendor-portal routes load a memento hand-off by id (same rule as vendor-badge-batch.ts): the vendor id comes from the
   authenticated session and is part of the query, so another vendor's hand-off, one that isn't sent yet, a revoked one and a made-up id
   are all indistinguishable: null (callers answer 404). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OwnMementoDispatch = MementoDispatchRow & { batch_name: string; event_id: string; event_name: string }

export async function loadOwnMementoDispatch(vendorId: string, id: string): Promise<OwnMementoDispatch | null> {
  if (!UUID.test(id)) return null
  const { data } = await supabaseAdmin.from('memento_dispatches')
    .select('*, memento_batches(name, event_id, events(name))')
    .eq('id', id).eq('vendor_id', vendorId).in('status', [...VENDOR_MEMENTO_VISIBLE]).maybeSingle()
  return shape(data)
}

export async function listOwnMementoDispatches(vendorId: string): Promise<OwnMementoDispatch[]> {
  const { data } = await supabaseAdmin.from('memento_dispatches')
    .select('*, memento_batches(name, event_id, events(name))')
    .eq('vendor_id', vendorId).in('status', [...VENDOR_MEMENTO_VISIBLE]).order('sent_at', { ascending: false })
  return (data ?? []).map(shape).filter((d): d is OwnMementoDispatch => !!d)
}

function shape(row: Record<string, unknown> | null): OwnMementoDispatch | null {
  if (!row) return null
  const b = (Array.isArray(row.memento_batches) ? row.memento_batches[0] : row.memento_batches) as { name: string; event_id: string; events: { name: string } | { name: string }[] | null } | null
  if (!b) return null
  const ev = Array.isArray(b.events) ? b.events[0] : b.events
  const { memento_batches: _omit, ...rest } = row as Record<string, unknown> & { memento_batches: unknown }
  void _omit
  return { ...(rest as unknown as MementoDispatchRow), batch_name: b.name, event_id: b.event_id, event_name: ev?.name ?? '' }
}
