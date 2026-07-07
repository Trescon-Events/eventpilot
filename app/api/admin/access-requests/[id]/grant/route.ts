/**
 * POST /api/admin/access-requests/:id/grant
 *   body: { duration_hours?: number | null, note?: string, force_manual?: boolean }
 *     duration_hours = null  → permanent
 *     duration_hours = 24    → 24h from now
 *   → { ok: true, granted_until }
 *
 * Applies the grant according to grant-map.ts:
 *   - Sets tool_grants[grantKey] = true (if a grantKey exists)
 *   - Appends role to access_roles (if a role exists)
 *   - Marks the access_requests row 'granted' with handled_by + handled_at
 *   - Stores granted_until if the grant is time-boxed (cron auto-revokes)
 *
 * Auth: super admin only.
 *
 * Manual-only tools (currently: 'admin') refuse unless force_manual=true
 * — protects against one-click super_admin grants by accident.
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
  const durationHours = body?.duration_hours === null || body?.duration_hours === undefined
    ? null
    : Number(body.duration_hours)
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null
  const forceManual = body?.force_manual === true

  if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours <= 0)) {
    return NextResponse.json({ error: 'duration_hours must be a positive number or null' }, { status: 400 })
  }

  // Load request row
  const { data: reqRow } = await supabaseAdmin
    .from('access_requests')
    .select('id, staff_id, tool_key, status')
    .eq('id', id)
    .single()
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (reqRow.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${reqRow.status}` }, { status: 400 })
  }

  const strat = GRANT_STRATEGY[reqRow.tool_key]
  if (strat?.manual && !forceManual) {
    return NextResponse.json({ error: 'This tool requires manual escalation. Confirm with force_manual=true.' }, { status: 400 })
  }

  // Load the target staff member
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, tool_grants, access_roles')
    .eq('id', reqRow.staff_id)
    .single()
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  // Apply the grant to staff_members
  const updates: Record<string, unknown> = {}
  if (strat?.grantKey) {
    updates.tool_grants = { ...(staff.tool_grants ?? {}), [strat.grantKey]: true }
  }
  if (strat?.role) {
    const currentRoles: string[] = Array.isArray(staff.access_roles) ? staff.access_roles : []
    if (!currentRoles.includes(strat.role)) {
      updates.access_roles = [...currentRoles, strat.role]
    }
  }
  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from('staff_members').update(updates).eq('id', staff.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const now = new Date()
  const grantedUntil = durationHours === null
    ? null
    : new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString()

  // Mark the request granted
  const { error: reqErr } = await supabaseAdmin
    .from('access_requests')
    .update({
      status:        'granted',
      handled_by:    session.sid,
      handled_at:    now.toISOString(),
      note:          note ?? undefined,
      granted_until: grantedUntil,
    })
    .eq('id', id)
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, granted_until: grantedUntil })
}
