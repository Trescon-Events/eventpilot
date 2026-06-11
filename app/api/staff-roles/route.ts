import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const VALID_ROLES = ['standard', 'hr', 'project_manager', 'project_director', 'admin', 'super_admin']

/* PATCH /api/staff-roles  { id, roles: string[] }
   Manually override a staff member's access_roles, bypassing HRMS sync.
   Always ensures at least ['standard'] is present. */
export async function PATCH(req: NextRequest) {
  const { id, roles } = await req.json()
  if (!id || !Array.isArray(roles)) {
    return NextResponse.json({ error: 'id and roles[] required' }, { status: 400 })
  }

  const clean = roles.filter(r => VALID_ROLES.includes(r))
  const final = clean.length > 0 ? clean : ['standard']

  const { error } = await supabaseAdmin
    .from('staff_members')
    .update({ access_roles: final })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, access_roles: final })
}
