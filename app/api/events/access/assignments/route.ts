import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET  /api/events/access/assignments?event_id=uuid — list (staff, role)
   assignments for one event, joined with staff name/email + role name.
   POST /api/events/access/assignments — body { event_id, staff_id, role_id }.
   Both platform admin only, matching /api/access-roles. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_access_assignments')
    .select('*, staff_members!staff_id(name, email), access_roles_catalog!role_id(name, slug)')
    .eq('event_id', eventId)
    .order('granted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { event_id?: string; staff_id?: string; role_id?: string } | null
  if (!body?.event_id || !body.staff_id || !body.role_id) {
    return NextResponse.json({ error: 'event_id, staff_id, and role_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_access_assignments')
    .insert({ event_id: body.event_id, staff_id: body.staff_id, role_id: body.role_id, granted_by: session.sid })
    .select('*, staff_members!staff_id(name, email), access_roles_catalog!role_id(name, slug)')
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: 'This staff member already holds this role on this event.' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
