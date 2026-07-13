import { supabaseAdmin } from '@/app/lib/supabase'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/**
 * Press Intelligence admin actions (approve/reject items, manage sources,
 * change thresholds, trigger a manual run) are restricted to super_admin and
 * KB module admins — unlike most of this app's admin routes, which trust the
 * client-supplied staff id without a role check.
 *
 * Two grant mechanisms are both honoured: the legacy 'kb_admin' string in
 * staff_members.access_roles (set by hand, no UI — e.g. Thulasi's original
 * grant), and the newer module_access table (module_key='kb'), which has a
 * real grant/revoke UI at Knowledge Base → Admins. New grants should go
 * through module_access; the legacy check stays so no one already granted
 * loses access.
 */
export async function isKbAdmin(staffId: string | null | undefined): Promise<boolean> {
  if (!staffId) return false
  if (staffId === 'super-admin') return true

  if (await hasModuleAccess(staffId, 'kb', 'admin')) return true

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('job_level, access_roles')
    .eq('id', staffId)
    .single()

  if (!data) return false
  return data.job_level === 'super_admin' || (data.access_roles ?? []).includes('kb_admin')
}
