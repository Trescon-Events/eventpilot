import { supabaseAdmin } from '@/app/lib/supabase'

/*
  Generalizes the "read tcs_session → check staff_members.tool_grants.<key>"
  pattern already implemented independently in
  app/lib/corporate-marketing/auth.ts and app/lib/smartexcel/auth.ts. Those
  two files also do module-specific user-sync/session work beyond the grant
  check itself, so they're left as-is rather than refactored onto this —
  this helper is for the registry's generic per-module access contract.
*/
export async function hasToolGrant(staffId: string | null | undefined, grantKey: string): Promise<boolean> {
  if (!staffId) return false
  if (staffId === 'super-admin') return true

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('job_level, tool_grants, toolkit_access')
    .eq('id', staffId)
    .single()
  if (!staff) return false
  if (staff.job_level === 'super_admin') return true

  const grants = { ...(staff.tool_grants ?? {}), ...(staff.toolkit_access ? { smart_data: true } : {}) }
  return grants[grantKey] === true
}
