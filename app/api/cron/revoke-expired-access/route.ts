/**
 * GET /api/cron/revoke-expired-access
 *
 * Runs every 15 minutes via Vercel/Railway Cron.
 *
 * Two independent sweeps, same cron:
 * 1. Every 'granted' access_requests row where granted_until <= NOW() —
 *    reverses the grant on staff_members, marks the row 'expired'.
 * 2. (2026-08-20) Every event_access_assignments row with expires_at <=
 *    NOW() — for freelancers/contractors on a fixed engagement, granted a
 *    time-boxed per-event RBAC role via AssignmentsTab. Deleted outright
 *    (matching the UI's own "Unassign" semantics), not soft-marked — the
 *    live permission checks in app/lib/access/event-access.ts already
 *    exclude expired-but-not-yet-swept rows, so this is cleanup, not the
 *    only thing standing between an expired grant and continued access.
 *
 * Auth: CRON_SECRET Bearer token (same pattern as every other cron endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GRANT_STRATEGY } from '@/app/lib/access-requests/grant-map'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const nowIso = new Date().toISOString()

  // Find all granted rows whose grant window has ended
  const { data: expired, error: findErr } = await supabaseAdmin
    .from('access_requests')
    .select('id, staff_id, tool_key, granted_until')
    .eq('status', 'granted')
    .not('granted_until', 'is', null)
    .lte('granted_until', nowIso)
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!expired || expired.length === 0) return NextResponse.json({ ok: true, revoked: 0 })

  let revoked = 0
  const failures: { id: string; err: string }[] = []

  for (const row of expired) {
    try {
      const strat = GRANT_STRATEGY[row.tool_key]
      if (strat) {
        const { data: staff } = await supabaseAdmin
          .from('staff_members')
          .select('tool_grants, access_roles')
          .eq('id', row.staff_id)
          .single()

        if (staff) {
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
            await supabaseAdmin.from('staff_members').update(updates).eq('id', row.staff_id)
          }
        }
      }

      await supabaseAdmin
        .from('access_requests')
        .update({
          status:         'expired',
          revoked_at:     nowIso,
          revoked_reason: 'expired',
        })
        .eq('id', row.id)
      revoked++
    } catch (err) {
      failures.push({ id: row.id, err: (err as Error).message })
    }
  }

  const { data: expiredAssignments, error: assignErr } = await supabaseAdmin
    .from('event_access_assignments')
    .delete()
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso)
    .select('id')
  const assignmentsRevoked = assignErr ? 0 : (expiredAssignments ?? []).length
  if (assignErr) failures.push({ id: 'event_access_assignments', err: assignErr.message })

  return NextResponse.json({ ok: true, revoked, assignmentsRevoked, failed: failures.length, failures })
}
