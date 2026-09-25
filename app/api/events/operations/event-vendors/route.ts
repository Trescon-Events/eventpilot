import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* Assign / unassign a directory vendor to one event.
   POST   /api/events/operations/event-vendors   Body: { event_id, vendor_id, purpose? }
   DELETE /api/events/operations/event-vendors   Body: { event_id, vendor_id, purpose? }
   purpose defaults to 'speaker_license'. Gated by ops.vendors.manage on the event. */

type Body = { event_id?: string; vendor_id?: string; purpose?: string }

async function authorize(req: NextRequest, eventId: string) {
  const session = getSession(req)
  const ok = !!session?.adm || (await hasEventPermission(session?.sid, eventId, 'ops.vendors.manage'))
  return { ok, staffId: session?.sid ?? null }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Body | null
  if (!body?.event_id || !body.vendor_id) return NextResponse.json({ error: 'event_id and vendor_id required' }, { status: 400 })
  const { ok, staffId } = await authorize(req, body.event_id)
  if (!ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: vendor } = await supabaseAdmin.from('ops_vendors').select('active').eq('id', body.vendor_id).single()
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  if (!vendor.active) return NextResponse.json({ error: 'This vendor is inactive.' }, { status: 409 })

  const { error } = await supabaseAdmin
    .from('ops_event_vendors')
    .upsert({ event_id: body.event_id, vendor_id: body.vendor_id, purpose: body.purpose || 'speaker_license', created_by: staffId }, { onConflict: 'event_id,vendor_id,purpose', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as Body | null
  if (!body?.event_id || !body.vendor_id) return NextResponse.json({ error: 'event_id and vendor_id required' }, { status: 400 })
  const { ok } = await authorize(req, body.event_id)
  if (!ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  // Never strand a vendor mid-batch: while they can still reach files for this
  // event, unassigning would leave live access with no ops owner. Revoke or
  // complete those batches first.
  const { count: liveBatches } = await supabaseAdmin.from('ops_license_batches').select('*', { count: 'exact', head: true })
    .eq('event_id', body.event_id).eq('vendor_id', body.vendor_id).in('status', ['sent', 'downloaded'])
  if ((liveBatches ?? 0) > 0) return NextResponse.json({ error: 'This vendor still has batches they can access on this event. Revoke or complete them first.' }, { status: 409 })

  const { error } = await supabaseAdmin
    .from('ops_event_vendors')
    .delete()
    .eq('event_id', body.event_id).eq('vendor_id', body.vendor_id).eq('purpose', body.purpose || 'speaker_license')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
