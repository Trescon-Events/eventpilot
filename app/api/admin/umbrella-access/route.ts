import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* Umbrella-level role assignments (2026-10-01) — see supabase/umbrella_access_assignments_migration.sql.
   GET  /api/admin/umbrella-access?umbrella_id=X — who holds which role at this umbrella.
   POST /api/admin/umbrella-access — { umbrella_id, staff_id, role_id, expires_at? }.
   A role granted here applies to EVERY event under the umbrella (current and future); access checks
   union it in (app/lib/access/event-access.ts). Platform admin only, like every access route.

   Same eligibility rule as per-event grants (Madhu, 2026-09-11): module access is held only by actual
   staff — here, someone on the Staff roster of at least one event under the umbrella. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const umbrellaId = req.nextUrl.searchParams.get('umbrella_id')
  if (!umbrellaId) return NextResponse.json({ error: 'umbrella_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('umbrella_access_assignments')
    .select('*, staff_members!staff_id(name, email), access_roles_catalog!role_id(name, slug)')
    .eq('umbrella_id', umbrellaId)
    .order('granted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { umbrella_id?: string; staff_id?: string; role_id?: string; expires_at?: string | null } | null
  if (!body?.umbrella_id || !body.staff_id || !body.role_id) return NextResponse.json({ error: 'umbrella_id, staff_id and role_id required' }, { status: 400 })
  if (body.expires_at != null && (Number.isNaN(Date.parse(body.expires_at)) || Date.parse(body.expires_at) <= Date.now())) {
    return NextResponse.json({ error: 'expires_at must be a valid date in the future' }, { status: 400 })
  }

  const { data: umbrella } = await supabaseAdmin.from('event_umbrellas').select('id').eq('id', body.umbrella_id).maybeSingle()
  if (!umbrella) return NextResponse.json({ error: 'Umbrella not found' }, { status: 404 })

  const { data: kids } = await supabaseAdmin.from('events').select('id').eq('umbrella_id', body.umbrella_id)
  const kidIds = (kids ?? []).map(k => k.id)
  const { data: roster } = kidIds.length
    ? await supabaseAdmin.from('event_staff').select('id').eq('staff_id', body.staff_id).in('event_id', kidIds).limit(1)
    : { data: [] as { id: string }[] }
  if (!roster?.length) {
    return NextResponse.json({ error: 'This staff member is not on the Staff roster of any event under this umbrella — add them to one of its events first.' }, { status: 422 })
  }

  const { data, error } = await supabaseAdmin
    .from('umbrella_access_assignments')
    .insert({ umbrella_id: body.umbrella_id, staff_id: body.staff_id, role_id: body.role_id, granted_by: session.sid && session.sid !== 'super-admin' ? session.sid : null, expires_at: body.expires_at ?? null })
    .select('*, staff_members!staff_id(name, email), access_roles_catalog!role_id(name, slug)')
    .single()
  if (error?.code === '23505') return NextResponse.json({ error: 'This staff member already holds this role at this umbrella.' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
