import { supabaseAdmin } from '@/app/lib/supabase'

// Generic per-module access tiers — 'user' can use a module's core features,
// 'admin' can additionally administer it (delete others' content, manage
// settings, grant/revoke access). Backed by the module_access table so new
// modules don't each need their own bespoke role-check file (see
// app/lib/kb/intel-access.ts for the one-off pattern this replaces going
// forward — not itself migrated by this change).

export const TIER_RANK: Record<string, number> = { user: 0, admin: 1 }

export async function hasModuleAccess(
  staffId: string | null | undefined,
  moduleKey: string,
  minTier: 'user' | 'admin'
): Promise<boolean> {
  if (!staffId) return false
  if (staffId === 'super-admin') return true

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('job_level')
    .eq('id', staffId)
    .single()
  if (staff?.job_level === 'super_admin') return true

  const { data: grant } = await supabaseAdmin
    .from('module_access')
    .select('tier')
    .eq('staff_id', staffId)
    .eq('module_key', moduleKey)
    .single()
  if (!grant) return false

  return TIER_RANK[grant.tier] >= TIER_RANK[minTier]
}
