/**
 * POST /api/admin/access-requests/:id/revoke
 *   body: { note?: string }
 *
 * Reverses a granted access ahead of its expiry. Applies the inverse of
 * the original grant (removes tool_grants key + access_roles entry).
 * Auth: super admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GRANT_STRATEGY } from '@/app/lib/access-requests/grant-map'

function parseSession(req: NextRequest): { sid?: string; adm?: boolean } | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = parseSession(req)
  if (!session?.adm || !session.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({}))
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  const { data: reqRow } = await supabaseAdmin
    .from('access_requests')
    .select('id, staff_id, tool_key, status')
    .eq('id', id)
    .single()
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (reqRow.status !== 'granted') {
    return NextResponse.json({ error: `Only granted requests can be revoked (this is ${reqRow.status})` }, { status: 400 })
  }

  await reverseGrant(reqRow.staff_id, reqRow.tool_key)

  const { error } = await supabaseAdmin
    .from('access_requests')
    .update({
      status:         'revoked',
      revoked_at:     new Date().toISOString(),
      revoked_reason: 'manual',
      note:           note ?? undefined,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Shared with the cron endpoint — reverse the tool_grants + access_roles
// changes originally applied by the grant handler.
export async function reverseGrant(staffId: string, toolKey: string): Promise<void> {
  const strat = GRANT_STRATEGY[toolKey]
  if (!strat) return

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants, access_roles')
    .eq('id', staffId)
    .single()
  if (!staff) return

  const updates: Record<string, unknown> = {}
  if (strat.grantKey && staff.tool_grants && strat.grantKey in staff.tool_grants) {
    const next = { ...(staff.tool_grants as Record<string, unknown>) }
    next[strat.grantKey] = false
    updates.tool_grants = next
  }
  if (strat.role && Array.isArray(staff.access_roles) && staff.access_roles.includes(strat.role)) {
    updates.access_roles = (staff.access_roles as string[]).filter(r => r !== strat.role)
  }
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('staff_members').update(updates).eq('id', staffId)
  }
}
