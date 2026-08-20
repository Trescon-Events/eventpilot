import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET  /api/events/access/assignments?event_id=uuid — list (staff, role)
   assignments for one event, joined with staff name/email + role name.
   GET  /api/events/access/assignments?event_id=global — list org-wide
   assignments (event_id IS NULL — applies to every event, 2026-08-16).
   POST /api/events/access/assignments — body { event_id, staff_id, role_id,
   expires_at? }. event_id may be null for a global assignment. expires_at
   (ISO string), omitted/null = never expires — set it for a freelancer/
   contractor on a fixed engagement; app/api/cron/revoke-expired-access
   sweeps it away automatically once past.
   Both platform admin only, matching /api/access-roles. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_access_assignments')
    .select('*, staff_members!staff_id(name, email), access_roles_catalog!role_id(name, slug)')
    .order('granted_at', { ascending: false })
  q = eventId === 'global' ? q.is('event_id', null) : q.eq('event_id', eventId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { event_id?: string | null; staff_id?: string; role_id?: string; expires_at?: string | null } | null
  if (!body || body.event_id === undefined || !body.staff_id || !body.role_id) {
    return NextResponse.json({ error: 'event_id (or null for a global assignment), staff_id, and role_id required' }, { status: 400 })
  }
  if (body.expires_at != null && Number.isNaN(Date.parse(body.expires_at))) {
    return NextResponse.json({ error: 'expires_at must be a valid date' }, { status: 400 })
  }
  if (body.expires_at != null && Date.parse(body.expires_at) <= Date.now()) {
    return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_access_assignments')
    .insert({ event_id: body.event_id, staff_id: body.staff_id, role_id: body.role_id, granted_by: session.sid, expires_at: body.expires_at ?? null })
    .select('*, staff_members!staff_id(name, email), access_roles_catalog!role_id(name, slug)')
    .single()

  if (error?.code === '23505') {
    return NextResponse.json({ error: body.event_id ? 'This staff member already holds this role on this event.' : 'This staff member already holds this role globally.' }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
