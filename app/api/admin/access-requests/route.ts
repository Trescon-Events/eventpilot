/**
 * GET /api/admin/access-requests
 *   ?status=pending|granted|denied|expired|revoked|all (default 'pending')
 *   ?limit=50 (default 100, max 500)
 *   → { requests: [...], counts: { pending, granted, denied, expired, revoked } }
 *
 * Returns joined staff details + human labels + expiry countdown info
 * so the dashboard renders without extra client-side lookups.
 *
 * Auth: super admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { labelFor, GRANT_STRATEGY } from '@/app/lib/access-requests/grant-map'

function parseSession(req: NextRequest): { sid?: string; adm?: boolean } | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

export async function GET(req: NextRequest) {
  const session = parseSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'pending'
  const limit  = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 100)))

  let query = supabaseAdmin
    .from('access_requests')
    .select('id, staff_id, tool_key, from_path, requested_at, status, handled_by, handled_at, note, granted_until, revoked_at, revoked_reason')
    .order('requested_at', { ascending: false })
    .limit(limit)
  if (status !== 'all') query = query.eq('status', status)

  const { data: rows } = await query

  // Batch-look up staff details
  const staffIds = Array.from(new Set([
    ...(rows ?? []).map(r => r.staff_id),
    ...(rows ?? []).map(r => r.handled_by).filter(Boolean),
  ])) as string[]
  const staffMap = new Map<string, { name: string; email: string; role: string | null; department: string | null }>()
  if (staffIds.length > 0) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email, role, department')
      .in('id', staffIds)
    for (const s of staff ?? []) staffMap.set(s.id, { name: s.name, email: s.email, role: s.role, department: s.department })
  }

  const now = Date.now()
  const requests = (rows ?? []).map(r => {
    const requester = staffMap.get(r.staff_id) ?? { name: '(unknown)', email: '', role: null, department: null }
    const handler   = r.handled_by ? staffMap.get(r.handled_by) : null
    const strat = GRANT_STRATEGY[r.tool_key]
    const expiresInMs = r.granted_until ? new Date(r.granted_until).getTime() - now : null
    return {
      id:             r.id,
      staff_id:       r.staff_id,
      requester_name: requester.name,
      requester_email: requester.email,
      requester_role: requester.role,
      requester_dept: requester.department,
      tool_key:       r.tool_key,
      tool_label:     labelFor(r.tool_key),
      manual_grant:   !!strat?.manual,
      from_path:      r.from_path,
      requested_at:   r.requested_at,
      status:         r.status,
      handled_by:     r.handled_by,
      handler_name:   handler?.name ?? null,
      handled_at:     r.handled_at,
      note:           r.note,
      granted_until:  r.granted_until,
      expires_in_ms:  expiresInMs,
      revoked_at:     r.revoked_at,
      revoked_reason: r.revoked_reason,
    }
  })

  // Status counts (independent of the filter above)
  const { data: allStatuses } = await supabaseAdmin
    .from('access_requests').select('status')
  const counts = { pending: 0, granted: 0, denied: 0, expired: 0, revoked: 0 }
  for (const r of allStatuses ?? []) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++
  }

  return NextResponse.json({ requests, counts })
}
