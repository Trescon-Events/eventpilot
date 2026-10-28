import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession, type TcsSession } from '@/app/lib/access/session'

/* The one Super Admin. Fixed in code on purpose: no screen, sync or database edit can add, change or remove this person — only a code change and a deploy can
   (Madhu, 28 Oct 2026). Sign-in is Microsoft SSO only, so the email below is a verified identity, not something a user can type.
   Super Admin alone appoints System Admins (staff with the `admin` role) and chooses who receives each kind of system alert. */
export const SUPER_ADMIN_EMAIL = 'md@tresconglobal.com'

export const isSuperAdminEmail = (email: string | null | undefined): boolean => (email ?? '').trim().toLowerCase() === SUPER_ADMIN_EMAIL

export async function isSuperAdminStaff(staffId: string | null | undefined): Promise<boolean> {
  if (!staffId) return false
  const { data } = await supabaseAdmin.from('staff_members').select('email').eq('id', staffId).maybeSingle()
  return isSuperAdminEmail(data?.email as string | undefined)
}

/** Gate for the Super Admin APIs: a valid session AND the fixed super admin email. */
export async function requireSuperAdmin(req: NextRequest): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!(await isSuperAdminStaff(session.sid))) return { error: NextResponse.json({ error: 'Only the Super Admin can do this.' }, { status: 403 }) }
  return { session }
}
