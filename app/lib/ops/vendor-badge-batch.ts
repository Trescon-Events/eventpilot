import { supabaseAdmin } from '@/app/lib/supabase'
import { VENDOR_DISPATCH_VISIBLE, type DispatchRow } from '@/app/lib/badges/dispatch'

/* The ONLY way vendor-portal routes load a badge print hand-off by id. The vendor id comes from the authenticated
   session and is part of the query, so another vendor's hand-off, one that isn't sent yet, a revoked one and a
   made-up id are all indistinguishable: null (callers answer 404). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OwnDispatch = DispatchRow & { batch_name: string; event_id: string; event_name: string }

export async function loadOwnDispatch(vendorId: string, id: string): Promise<OwnDispatch | null> {
  if (!UUID.test(id)) return null
  const { data } = await supabaseAdmin.from('badge_print_dispatches')
    .select('*, badge_batches(name, event_id, events(name))')
    .eq('id', id).eq('vendor_id', vendorId).in('status', [...VENDOR_DISPATCH_VISIBLE]).maybeSingle()
  return shape(data)
}

export async function listOwnDispatches(vendorId: string): Promise<OwnDispatch[]> {
  const { data } = await supabaseAdmin.from('badge_print_dispatches')
    .select('*, badge_batches(name, event_id, events(name))')
    .eq('vendor_id', vendorId).in('status', [...VENDOR_DISPATCH_VISIBLE]).order('sent_at', { ascending: false })
  return (data ?? []).map(shape).filter((d): d is OwnDispatch => !!d)
}

function shape(row: Record<string, unknown> | null): OwnDispatch | null {
  if (!row) return null
  const b = (Array.isArray(row.badge_batches) ? row.badge_batches[0] : row.badge_batches) as { name: string; event_id: string; events: { name: string } | { name: string }[] | null } | null
  if (!b) return null
  const ev = Array.isArray(b.events) ? b.events[0] : b.events
  const { badge_batches: _omit, ...rest } = row as Record<string, unknown> & { badge_batches: unknown }
  void _omit
  return { ...(rest as unknown as DispatchRow), batch_name: b.name, event_id: b.event_id, event_name: ev?.name ?? '' }
}
