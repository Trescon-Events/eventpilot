import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET  /api/hrms-role-map — every Staff Portal role_type ever seen in
   event_staff.project_role_type (already synced there by app/api/
   hrms-sync + app/api/cron/hrms-sync), unioned with any role_type that
   has a saved mapping even if it's since disappeared from live data (so
   an admin can still see/clear a stale mapping), each with its current
   access_role_id + role name if mapped. Powers the "Staff Portal Role
   Mapping" tab on app/admin/access/page.tsx.
   POST /api/hrms-role-map — body { role_type, access_role_id }
   (access_role_id may be null = explicitly "no access"). Upserts by
   role_type. Both platform admin only, matching /api/access-roles. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const [{ data: seen }, { data: mapped }] = await Promise.all([
    supabaseAdmin.from('event_staff').select('project_role_type').not('project_role_type', 'is', null),
    supabaseAdmin.from('hrms_role_access_map').select('role_type, access_role_id, access_roles_catalog!access_role_id(name)'),
  ])

  const seenTypes = new Set((seen ?? []).map(r => r.project_role_type as string))
  const mappedByType = new Map((mapped ?? []).map(m => [m.role_type, m]))
  for (const m of mapped ?? []) seenTypes.add(m.role_type)

  const rows = Array.from(seenTypes).sort().map(role_type => {
    const m = mappedByType.get(role_type)
    const role = m ? (Array.isArray(m.access_roles_catalog) ? m.access_roles_catalog[0] : m.access_roles_catalog) : null
    return { role_type, access_role_id: m?.access_role_id ?? null, access_role_name: role?.name ?? null }
  })

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { role_type?: string; access_role_id?: string | null } | null
  if (!body?.role_type || body.access_role_id === undefined) {
    return NextResponse.json({ error: 'role_type and access_role_id (or null) required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('hrms_role_access_map')
    .upsert({ role_type: body.role_type, access_role_id: body.access_role_id, updated_at: new Date().toISOString() }, { onConflict: 'role_type' })
    .select('role_type, access_role_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
