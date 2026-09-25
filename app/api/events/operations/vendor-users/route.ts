import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { normalizeEmail } from '@/app/lib/ops/vendor-auth/preflight'
import { issueSetPasswordLink, INVITE_HOURS } from '@/app/lib/ops/vendor-auth/account'
import { sendVendorInvite } from '@/app/lib/ops/vendor-auth/mail'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* Vendor Portal accounts, managed by Trescon ops.
   GET  /api/events/operations/vendor-users?event_id=X&vendor_id=Y   list logins for a vendor
   POST /api/events/operations/vendor-users   Body: { event_id, vendor_id, name, email, contact_id? }
        Creates an INVITED login and emails the person a single-use link to
        choose their OWN password. Ops never sees or sets a password, and the
        link is never returned in the response.
   Gated by ops.vendor_accounts.manage on the event, and the vendor must be
   assigned to that event (so ops on one event can't manage another event's vendor). */

async function authorize(req: NextRequest, eventId: string, vendorId: string) {
  const session = getSession(req)
  const allowed = !!session?.adm || (await hasEventPermission(session?.sid, eventId, 'ops.vendor_accounts.manage'))
  if (!allowed) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  const { data: link } = await supabaseAdmin.from('ops_event_vendors').select('vendor_id').eq('event_id', eventId).eq('vendor_id', vendorId).limit(1).maybeSingle()
  if (!link) return { error: NextResponse.json({ error: 'That vendor is not assigned to this event.' }, { status: 400 }) }
  return { staffId: session?.sid ?? null }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id'), vendorId = req.nextUrl.searchParams.get('vendor_id')
  if (!eventId || !vendorId) return NextResponse.json({ error: 'event_id and vendor_id required' }, { status: 400 })
  const auth = await authorize(req, eventId, vendorId)
  if ('error' in auth) return auth.error

  const { data, error } = await supabaseAdmin.from('ops_vendor_users')
    .select('id, name, email, status, last_login_at, created_at').eq('vendor_id', vendorId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; vendor_id?: string; name?: string; email?: string; contact_id?: string } | null
  if (!body?.event_id || !body.vendor_id) return NextResponse.json({ error: 'event_id and vendor_id required' }, { status: 400 })
  const auth = await authorize(req, body.event_id, body.vendor_id)
  if ('error' in auth) return auth.error

  const email = normalizeEmail(body.email)
  const name = body.name?.trim()
  if (!email || !name) return NextResponse.json({ error: 'A name and a valid email are required.' }, { status: 400 })

  const { data: vendor } = await supabaseAdmin.from('ops_vendors').select('name, active').eq('id', body.vendor_id).single()
  if (!vendor?.active) return NextResponse.json({ error: 'This vendor is inactive.' }, { status: 409 })

  const { data: user, error } = await supabaseAdmin.from('ops_vendor_users')
    .insert({ vendor_id: body.vendor_id, contact_id: body.contact_id ?? null, name, email, created_by: auth.staffId })
    .select('id').single()
  if (error) {
    const dup = error.code === '23505'
    return NextResponse.json({ error: dup ? 'A Vendor Portal login already exists for that email.' : error.message }, { status: dup ? 409 : 500 })
  }

  try {
    const link = await issueSetPasswordLink(user.id, 'invite', INVITE_HOURS, auth.staffId)
    await sendVendorInvite({ to: email, name, vendorName: vendor.name, link, hours: INVITE_HOURS })
  } catch (e) {
    // Don't leave a login nobody can activate; ops can simply retry.
    await supabaseAdmin.from('ops_vendor_users').delete().eq('id', user.id)
    return NextResponse.json({ error: `The invitation email could not be sent. ${e instanceof Error ? e.message : ''}`.trim() }, { status: 502 })
  }

  await logOpsAccess({ eventId: body.event_id, actorType: 'staff', actorId: auth.staffId, action: 'vendor_user_invited', targetType: 'vendor_user', targetId: user.id, meta: { vendor_id: body.vendor_id }, ip: clientIp(req) })
  return NextResponse.json({ id: user.id })
}
