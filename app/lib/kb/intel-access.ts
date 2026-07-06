import { supabaseAdmin } from '@/app/lib/supabase'

/**
 * Press Intelligence admin actions (approve/reject items, manage sources,
 * change thresholds, trigger a manual run) are restricted to super_admin and
 * staff with 'kb_admin' in access_roles — unlike most of this app's admin
 * routes, which trust the client-supplied staff id without a role check.
 */
export async function isKbAdmin(staffId: string | null | undefined): Promise<boolean> {
  if (!staffId) return false
  if (staffId === 'super-admin') return true

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('job_level, access_roles')
    .eq('id', staffId)
    .single()

  if (!data) return false
  return data.job_level === 'super_admin' || (data.access_roles ?? []).includes('kb_admin')
}
