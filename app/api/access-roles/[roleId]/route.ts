import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { isKnownPermissionKey } from '@/app/lib/registry/access-permissions'

/* PATCH /api/access-roles/[roleId] — edit name/description/permission_keys.
   permission_keys, when provided, REPLACES the full set (delete-then-insert)
   rather than merging — matches how the Roles editor UI submits (the whole
   checkbox tree's current state), not incremental add/remove calls.
   DELETE /api/access-roles/[roleId] — delete a role (blocked if
   is_system); cascades to event_access_assignments via FK. Both admin only. */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { roleId } = await params

  const body = await req.json().catch(() => null) as { name?: string; description?: string | null; permission_keys?: string[] } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  if (body.permission_keys) {
    const unknown = body.permission_keys.filter(k => !isKnownPermissionKey(k))
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown permission key(s): ${unknown.join(', ')}` }, { status: 400 })
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) update.name = body.name
  if (body.description !== undefined) update.description = body.description

  const { data: role, error } = await supabaseAdmin
    .from('access_roles_catalog')
    .update(update)
    .eq('id', roleId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.permission_keys) {
    await supabaseAdmin.from('access_role_permissions').delete().eq('role_id', roleId)
    if (body.permission_keys.length > 0) {
      const { error: permError } = await supabaseAdmin
        .from('access_role_permissions')
        .insert(body.permission_keys.map(key => ({ role_id: roleId, permission_key: key })))
      if (permError) return NextResponse.json({ error: permError.message }, { status: 500 })
    }
  }

  return NextResponse.json(role)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { roleId } = await params

  const { data: role } = await supabaseAdmin.from('access_roles_catalog').select('is_system').eq('id', roleId).single()
  if (role?.is_system) return NextResponse.json({ error: 'This role is protected and cannot be deleted.' }, { status: 403 })

  const { error } = await supabaseAdmin.from('access_roles_catalog').delete().eq('id', roleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
