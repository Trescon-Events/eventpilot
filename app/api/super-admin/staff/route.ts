import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireSuperAdmin, isSuperAdminEmail } from '@/app/lib/access/super-admin'

/* Super Admin only. Everyone who can sign in, with their access roles, so System Admins can be appointed (roles are saved through PATCH /api/staff-roles, which re-checks). */
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req)
  if ('error' in gate) return gate.error
  const { data } = await supabaseAdmin.from('staff_members').select('id, name, email, department, access_roles, access_enabled').eq('access_enabled', true).order('name')
  return NextResponse.json({ staff: (data ?? []).map(s => ({ id: s.id, name: s.name, email: s.email, department: s.department, access_roles: s.access_roles ?? ['standard'], is_super_admin: isSuperAdminEmail(s.email as string) })) })
}
