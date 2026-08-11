import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { isKnownPermissionKey } from '@/app/lib/registry/access-permissions'

/* GET  /api/access-roles — list the global role catalog (name, slug,
   description, permission_keys). Platform admin only — same bootstrapping
   rationale as every other "who grants the first grant" surface in this
   codebase (module_access admin tier, tool_grants): only a platform admin
   defines/assigns roles in v1.
   POST /api/access-roles — create a role. Body: { name, slug, description?,
   permission_keys: string[] }. Each key is validated against
   app/lib/registry/access-permissions.ts's ACCESS_REGISTRY — not FK'd to a
   DB table, so an unknown key is rejected here instead of silently stored. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: roles, error } = await supabaseAdmin
    .from('access_roles_catalog')
    .select('*, access_role_permissions(permission_key)')
    .is('event_id', null)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const shaped = (roles ?? []).map(r => ({
    ...r,
    permission_keys: (r.access_role_permissions ?? []).map((p: { permission_key: string }) => p.permission_key),
    access_role_permissions: undefined,
  }))
  return NextResponse.json(shaped)
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { name?: string; slug?: string; description?: string; permission_keys?: string[] } | null
  if (!body?.name?.trim() || !body.slug?.trim()) {
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 })
  }
  const permissionKeys = body.permission_keys ?? []
  const unknown = permissionKeys.filter(k => !isKnownPermissionKey(k))
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown permission key(s): ${unknown.join(', ')}` }, { status: 400 })
  }

  const { data: role, error } = await supabaseAdmin
    .from('access_roles_catalog')
    .insert({ name: body.name.trim(), slug: body.slug.trim(), description: body.description ?? null, created_by: session.sid })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (permissionKeys.length > 0) {
    const { error: permError } = await supabaseAdmin
      .from('access_role_permissions')
      .insert(permissionKeys.map(key => ({ role_id: role.id, permission_key: key })))
    if (permError) return NextResponse.json({ error: permError.message }, { status: 500 })
  }

  return NextResponse.json({ ...role, permission_keys: permissionKeys }, { status: 201 })
}
