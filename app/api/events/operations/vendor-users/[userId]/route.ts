import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { resolveScope, scopeFromParams, hasScopePermission, ownerColumn, auditOwner } from '@/app/lib/ops/scope'
import { issueSetPasswordLink, INVITE_HOURS, OPS_RESET_HOURS } from '@/app/lib/ops/vendor-auth/account'
import { sendVendorInvite, sendVendorReset } from '@/app/lib/ops/vendor-auth/mail'
import { revokeAllSessionsForUser } from '@/app/lib/ops/vendor-auth/session'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* POST /api/events/operations/vendor-users/[userId]
   Body: { event_id | umbrella_id, action: 'send_link' | 'disable' | 'enable' }
     send_link — emails a fresh single-use link (invite if they never set a
                 password, otherwise reset) DIRECTLY to the vendor user. Any
                 earlier link stops working. Ops never sees the link.
     disable   — blocks login and revokes every live session immediately.
     enable    — re-allows login (back to invited if no password was ever set).
   Gated by ops.vendor_accounts.manage on the event; the user's vendor must be assigned to it. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const body = await req.json().catch(() => null) as { event_id?: string; umbrella_id?: string; action?: string } | null
  const scope = await resolveScope(scopeFromParams(body))
  if (!scope || !['send_link', 'disable', 'enable'].includes(body?.action ?? '')) {
    return NextResponse.json({ error: 'event_id (or umbrella_id) and a valid action are required.' }, { status: 400 })
  }

  const session = getSession(req)
  if (!(await hasScopePermission(session, scope, 'ops.vendor_accounts.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: user } = await supabaseAdmin.from('ops_vendor_users')
    .select('id, vendor_id, name, email, status, password_hash, ops_vendors(name)').eq('id', userId).maybeSingle()
  const { data: link } = user
    ? await supabaseAdmin.from('ops_event_vendors').select('vendor_id').eq(ownerColumn(scope), scope.id).eq('vendor_id', user.vendor_id).limit(1).maybeSingle()
    : { data: null }
  // Same answer whether the user doesn't exist or belongs to a vendor outside this scope.
  if (!user || !link) return NextResponse.json({ error: 'Login not found for this event.' }, { status: 404 })

  const staffId = session?.sid ?? null
  const audit = (action: string) => logOpsAccess({ ...auditOwner(scope), actorType: 'staff', actorId: staffId, action, targetType: 'vendor_user', targetId: user.id, ip: clientIp(req) })

  if (body?.action === 'disable') {
    await supabaseAdmin.from('ops_vendor_users').update({ status: 'disabled', updated_at: new Date().toISOString() }).eq('id', user.id)
    await revokeAllSessionsForUser(user.id)
    await audit('vendor_user_disabled')
    return NextResponse.json({ ok: true })
  }

  if (body?.action === 'enable') {
    await supabaseAdmin.from('ops_vendor_users').update({ status: user.password_hash ? 'active' : 'invited', failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq('id', user.id)
    await audit('vendor_user_enabled')
    return NextResponse.json({ ok: true })
  }

  // send_link
  if (user.status === 'disabled') return NextResponse.json({ error: 'This login is disabled. Enable it first.' }, { status: 409 })
  const vendor = Array.isArray(user.ops_vendors) ? user.ops_vendors[0] : user.ops_vendors
  const purpose = user.password_hash ? 'reset' : 'invite'
  try {
    const hours = purpose === 'invite' ? INVITE_HOURS : OPS_RESET_HOURS
    const url = await issueSetPasswordLink(user.id, purpose, hours, staffId)
    if (purpose === 'invite') await sendVendorInvite({ to: user.email, name: user.name, vendorName: vendor?.name ?? 'your company', link: url, hours })
    else await sendVendorReset({ to: user.email, name: user.name, link: url, hours })
  } catch (e) {
    return NextResponse.json({ error: `The email could not be sent. ${e instanceof Error ? e.message : ''}`.trim() }, { status: 502 })
  }
  await audit(purpose === 'invite' ? 'vendor_user_invite_resent' : 'vendor_user_reset_sent')
  return NextResponse.json({ ok: true, sent_to: user.email })
}
