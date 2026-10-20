// Memento hand-off: producer -> Ops -> memento vendor -> Ops (table in supabase/speaker_mementos_ops_migration.sql). Modelled on
// app/lib/badges/dispatch.ts; the vendor downloads the batch's Cleaned Photos as one ZIP and confirms they look good (or reports a problem).
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendOpsNotice, PORTAL_BASE } from '@/app/lib/ops/vendor-auth/mail'
import { staffForSection } from '@/app/lib/ops/section-access'
import { notifyStaff } from '@/app/lib/notify'

export type MementoDispatchStatus = 'requested' | 'sent' | 'downloaded' | 'confirmed' | 'issue' | 'revoked'
/** One of these per batch at most: the hand-off is still in flight. */
export const ACTIVE_MEMENTO_DISPATCH: MementoDispatchStatus[] = ['requested', 'sent', 'downloaded', 'issue']
/** What the memento vendor can see. */
export const VENDOR_MEMENTO_VISIBLE: MementoDispatchStatus[] = ['sent', 'downloaded', 'confirmed', 'issue']

export type MementoDispatchRow = {
  id: string; batch_id: string; speakers: number; status: MementoDispatchStatus
  requested_by: string | null; requested_at: string; request_note: string | null
  vendor_id: string | null; sent_by: string | null; sent_at: string | null
  first_downloaded_at: string | null; last_downloaded_at: string | null; download_count: number
  vendor_response_at: string | null; vendor_response_by: string | null; vendor_note: string | null
  revoked_by: string | null; revoked_at: string | null
}

export async function loadMementoDispatch(id: string): Promise<MementoDispatchRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabaseAdmin.from('memento_dispatches').select('*').eq('id', id).maybeSingle()
  return (data as MementoDispatchRow | null) ?? null
}

export const opsMementoPath = (eventId: string, batchId: string) => `/admin/events/${eventId}/operations/mementos/${batchId}`

type Ctx = { eventId: string; eventName: string; batchName: string; batchId: string }

export async function mementoBatchContext(batchId: string): Promise<Ctx | null> {
  const { data } = await supabaseAdmin.from('memento_batches').select('id, name, event_id, events(name)').eq('id', batchId).maybeSingle()
  if (!data) return null
  const ev = Array.isArray(data.events) ? data.events[0] : data.events
  return { eventId: data.event_id as string, eventName: (ev as { name?: string } | null)?.name ?? 'the event', batchName: data.name as string, batchId }
}

/** Email + bell to everyone responsible for Mementos on this event. Never throws. Returns how many people were told. */
export async function notifyMementoOps(ctx: Ctx, kind: 'requested' | 'downloaded' | 'confirmed' | 'issue', extra?: { note?: string | null; vendorName?: string; speakers?: number }): Promise<number> {
  try {
    const { staff } = await staffForSection(ctx.eventId, 'mementos')
    if (!staff.length) return 0
    const path = opsMementoPath(ctx.eventId, ctx.batchId)
    const vendor = extra?.vendorName ?? 'The memento vendor'
    const copy = {
      requested: { subject: `Speaker photos for mementos — ${ctx.eventName}`, heading: 'Speaker photos ready for the memento vendor', message: `The producer has pushed the memento batch "${ctx.batchName}" (${extra?.speakers ?? ''} speakers' Cleaned Photos) for ${ctx.eventName} to Ops. Please review it and send it to the memento vendor.${extra?.note ? ` Note from the producer: ${extra.note}` : ''}`, bell: 'Memento photos ready for the vendor' },
      downloaded: { subject: `Memento photos downloaded — ${ctx.eventName}`, heading: 'Memento photos downloaded', message: `${vendor} has downloaded the photos for "${ctx.batchName}" (${ctx.eventName}).`, bell: 'Memento photos downloaded by the vendor' },
      confirmed: { subject: `Memento photos confirmed — ${ctx.eventName}`, heading: 'Memento photos confirmed', message: `${vendor} has confirmed that the photos for "${ctx.batchName}" (${ctx.eventName}) look good.${extra?.note ? ` Note: ${extra.note}` : ''}`, bell: 'Memento photos confirmed by the vendor' },
      issue: { subject: `Problem with memento photos — ${ctx.eventName}`, heading: 'The vendor reported a problem', message: `${vendor} reported a problem with the photos for "${ctx.batchName}" (${ctx.eventName}).${extra?.note ? ` They wrote: ${extra.note}` : ''}`, bell: 'Memento vendor reported a problem' },
    }[kind]
    await Promise.all([
      sendOpsNotice({ to: staff.map(s => s.email), subject: copy.subject, heading: copy.heading, message: copy.message, link: { href: `${PORTAL_BASE}${path}`, label: 'Open Mementos' } }),
      notifyStaff(staff.map(s => s.id), { type: `memento_${kind}`, title: `${copy.bell} — ${ctx.eventName}`, body: copy.message, link: path, eventId: ctx.eventId }),
    ])
    return staff.length
  } catch (e) {
    console.error('[mementos] notifyMementoOps failed:', e instanceof Error ? e.message : e)
    return 0
  }
}

/** Active memento vendors engaged for this event (directly, or through its umbrella), each with their active login count. */
export async function mementoVendorsForEvent(eventId: string): Promise<Array<{ id: string; name: string; logins: number }>> {
  const { data: ev } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', eventId).maybeSingle()
  const owners = [`event_id.eq.${eventId}`, ev?.umbrella_id ? `umbrella_id.eq.${ev.umbrella_id}` : null].filter(Boolean).join(',')
  const { data: links } = await supabaseAdmin.from('ops_event_vendors').select('vendor_id, ops_vendors(id, name, active)').eq('purpose', 'memento').or(owners)
  const vendors = new Map<string, { id: string; name: string }>()
  for (const l of links ?? []) {
    const v = (Array.isArray(l.ops_vendors) ? l.ops_vendors[0] : l.ops_vendors) as { id: string; name: string; active: boolean } | null
    if (v?.active) vendors.set(v.id, { id: v.id, name: v.name })
  }
  if (!vendors.size) return []
  const { data: users } = await supabaseAdmin.from('ops_vendor_users').select('vendor_id, status').in('vendor_id', [...vendors.keys()])
  return [...vendors.values()].map(v => ({ ...v, logins: (users ?? []).filter(u => u.vendor_id === v.id && u.status !== 'disabled').length })).sort((a, b) => a.name.localeCompare(b.name))
}
