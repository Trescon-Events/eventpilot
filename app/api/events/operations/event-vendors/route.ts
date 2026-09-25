import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { resolveScope, scopeFromParams, hasScopePermission, ownerColumn, ownerFields } from '@/app/lib/ops/scope'

/* Assign / unassign a directory vendor to a scope (an event, or an umbrella).
   POST   /api/events/operations/event-vendors   Body: { event_id | umbrella_id, vendor_id, purpose? }
   DELETE /api/events/operations/event-vendors   Body: { event_id | umbrella_id, vendor_id, purpose? }
   purpose defaults to 'speaker_license'. Gated by ops.vendors.manage. */

type Body = { event_id?: string; umbrella_id?: string; vendor_id?: string; purpose?: string }

async function authorize(req: NextRequest, body: Body | null) {
  const scope = await resolveScope(scopeFromParams(body))
  if (!scope || !body?.vendor_id) return { error: NextResponse.json({ error: 'event_id (or umbrella_id) and vendor_id required' }, { status: 400 }) }
  const session = getSession(req)
  if (!(await hasScopePermission(session, scope, 'ops.vendors.manage'))) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { scope, staffId: session?.sid ?? null, vendorId: body.vendor_id, purpose: body.purpose || 'speaker_license' }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, await req.json().catch(() => null))
  if ('error' in auth) return auth.error

  const { data: vendor } = await supabaseAdmin.from('ops_vendors').select('active').eq('id', auth.vendorId).single()
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  if (!vendor.active) return NextResponse.json({ error: 'This vendor is inactive.' }, { status: 409 })

  const { data: existing } = await supabaseAdmin.from('ops_event_vendors').select('id')
    .eq(ownerColumn(auth.scope), auth.scope.id).eq('vendor_id', auth.vendorId).eq('purpose', auth.purpose).maybeSingle()
  if (!existing) {
    const { error } = await supabaseAdmin.from('ops_event_vendors')
      .insert({ ...ownerFields(auth.scope), vendor_id: auth.vendorId, purpose: auth.purpose, created_by: auth.staffId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req, await req.json().catch(() => null))
  if ('error' in auth) return auth.error

  // Never strand a vendor mid-batch: while they can still reach files for this
  // scope, unassigning would leave live access with no ops owner. Revoke or
  // complete those batches first.
  const { count: liveBatches } = await supabaseAdmin.from('ops_license_batches').select('*', { count: 'exact', head: true })
    .eq(ownerColumn(auth.scope), auth.scope.id).eq('vendor_id', auth.vendorId).in('status', ['sent', 'downloaded'])
  if ((liveBatches ?? 0) > 0) return NextResponse.json({ error: 'This vendor still has batches they can access here. Revoke or complete them first.' }, { status: 409 })

  const { error } = await supabaseAdmin.from('ops_event_vendors').delete()
    .eq(ownerColumn(auth.scope), auth.scope.id).eq('vendor_id', auth.vendorId).eq('purpose', auth.purpose)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
