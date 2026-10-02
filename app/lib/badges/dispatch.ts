// Badge print hand-off: producer -> Ops -> print vendor -> Ops (tables in supabase/badge_dispatch_migration.sql).
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendOpsNotice, PORTAL_BASE } from '@/app/lib/ops/vendor-auth/mail'
import { staffForSection } from '@/app/lib/ops/section-access'
import { getSupportContacts } from '@/app/lib/ops/vendor-auth/support'
import { notifyStaff } from '@/app/lib/notify'

export type DispatchStatus = 'requested' | 'sent' | 'downloaded' | 'printed' | 'revoked'
export const ACTIVE_DISPATCH: DispatchStatus[] = ['requested', 'sent', 'downloaded']
/** What the vendor can see/act on. */
export const VENDOR_DISPATCH_VISIBLE: DispatchStatus[] = ['sent', 'downloaded', 'printed']

export type DispatchRow = {
  id: string; batch_id: string; pdf_version: number; pdf_key: string; badges: number; status: DispatchStatus
  requested_by: string | null; requested_at: string; request_note: string | null
  vendor_id: string | null; sent_by: string | null; sent_at: string | null
  first_downloaded_at: string | null; last_downloaded_at: string | null; download_count: number
  printed_confirmed_at: string | null; printed_confirmed_by: string | null; printed_note: string | null
  revoked_by: string | null; revoked_at: string | null
}

export async function loadDispatch(id: string): Promise<DispatchRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabaseAdmin.from('badge_print_dispatches').select('*').eq('id', id).maybeSingle()
  return (data as DispatchRow | null) ?? null
}

export const opsBadgePath = (eventId: string, batchId: string) => `/admin/events/${eventId}/operations/badges/${batchId}`

type Ctx = { eventId: string; eventName: string; batchName: string; batchId: string }

export async function batchContext(batchId: string): Promise<Ctx | null> {
  const { data } = await supabaseAdmin.from('badge_batches').select('id, name, event_id, events(name)').eq('id', batchId).maybeSingle()
  if (!data) return null
  const ev = Array.isArray(data.events) ? data.events[0] : data.events
  return { eventId: data.event_id as string, eventName: (ev as { name?: string } | null)?.name ?? 'the event', batchName: data.name as string, batchId }
}

/** Email + bell to everyone responsible for Badge Printing on this event. Never throws. Returns how many people were told. */
export async function notifyBadgeOps(ctx: Ctx, kind: 'requested' | 'downloaded' | 'printed', extra?: { note?: string | null; vendorName?: string; badges?: number }): Promise<number> {
  try {
    const { staff } = await staffForSection(ctx.eventId, 'badges')
    if (!staff.length) return 0
    const path = opsBadgePath(ctx.eventId, ctx.batchId)
    const copy = {
      requested: { subject: `Badges ready for printing — ${ctx.eventName}`, heading: 'Speaker badges ready for print', message: `The producer has released the speaker badge batch "${ctx.batchName}" (${extra?.badges ?? ''} badges) for ${ctx.eventName} for printing. Please review the print file and send it to the print vendor.${extra?.note ? ` Note from the producer: ${extra.note}` : ''}`, label: 'Open Badge Printing', bell: 'Badges ready for printing' },
      downloaded: { subject: `Badge print file downloaded — ${ctx.eventName}`, heading: 'Print file downloaded', message: `${extra?.vendorName ?? 'The print vendor'} has downloaded the badge print file for "${ctx.batchName}" (${ctx.eventName}).`, label: 'Open Badge Printing', bell: 'Print file downloaded by the vendor' },
      printed: { subject: `Badges printed — ${ctx.eventName}`, heading: 'Speaker badges printed', message: `${extra?.vendorName ?? 'The print vendor'} has confirmed that the speaker badges for "${ctx.batchName}" (${ctx.eventName}) are printed.${extra?.note ? ` Note: ${extra.note}` : ''}`, label: 'Open Badge Printing', bell: 'Speaker badges printed' },
    }[kind]
    await Promise.all([
      sendOpsNotice({ to: staff.map(s => s.email), subject: copy.subject, heading: copy.heading, message: copy.message, link: { href: `${PORTAL_BASE}${path}`, label: copy.label } }),
      notifyStaff(staff.map(s => s.id), { type: `badge_print_${kind}`, title: `${copy.bell} — ${ctx.eventName}`, body: copy.message, link: path, eventId: ctx.eventId }),
    ])
    return staff.length
  } catch (e) {
    console.error('[badges] notifyBadgeOps failed:', e instanceof Error ? e.message : e)
    return 0
  }
}

/** Active print vendors engaged for this event (directly, or through its umbrella), each with their active login count. */
export async function printVendorsForEvent(eventId: string): Promise<Array<{ id: string; name: string; logins: number }>> {
  const { data: ev } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', eventId).maybeSingle()
  const owners = [`event_id.eq.${eventId}`, ev?.umbrella_id ? `umbrella_id.eq.${ev.umbrella_id}` : null].filter(Boolean).join(',')
  const { data: links } = await supabaseAdmin.from('ops_event_vendors').select('vendor_id, ops_vendors(id, name, active)').eq('purpose', 'badge_print').or(owners)
  const vendors = new Map<string, { id: string; name: string }>()
  for (const l of links ?? []) {
    const v = (Array.isArray(l.ops_vendors) ? l.ops_vendors[0] : l.ops_vendors) as { id: string; name: string; active: boolean } | null
    if (v?.active) vendors.set(v.id, { id: v.id, name: v.name })
  }
  if (!vendors.size) return []
  const { data: users } = await supabaseAdmin.from('ops_vendor_users').select('vendor_id, status').in('vendor_id', [...vendors.keys()])
  return [...vendors.values()].map(v => ({ ...v, logins: (users ?? []).filter(u => u.vendor_id === v.id && u.status !== 'disabled').length })).sort((a, b) => a.name.localeCompare(b.name))
}

/** The "who to contact" list vendor emails show: ops.view holders of the event. */
export async function getSupportContactsForEvent(eventId: string): Promise<{ name: string; email: string }[]> {
  return (await getSupportContacts([eventId])).map(c => ({ name: c.name, email: c.email }))
}
