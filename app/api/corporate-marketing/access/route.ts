/**
 * GET /api/corporate-marketing/access
 *   → { members: [{ id, name, email, department, kind }] }
 *
 * Returns everyone who can currently reach Corporate Marketing:
 *   - kind='admin'  → super admins (staff_members.job_level='super_admin' OR access_enabled+admin flag)
 *   - kind='grant'  → staff_members with tool_grants.corporate_marketing = true
 *
 * Used by the Settings tab so Marketing can see who has access without
 * opening the admin permission matrix.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  // Fetch admins + anyone with the grant. The .contains query on JSONB
  // filters server-side so we don't scan the full staff table.
  const [{ data: admins }, { data: granted }] = await Promise.all([
    supabaseAdmin
      .from('staff_members')
      .select('id, name, email, department')
      .eq('job_level', 'super_admin')
      .eq('is_active', true),
    supabaseAdmin
      .from('staff_members')
      .select('id, name, email, department')
      .contains('tool_grants', { corporate_marketing: true })
      .eq('is_active', true),
  ])

  type Member = { id: string; name: string; email: string; department: string | null; kind: 'admin' | 'grant' }
  const seen = new Set<string>()
  const members: Member[] = []
  for (const a of admins ?? []) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    members.push({ id: a.id, name: a.name, email: a.email, department: a.department, kind: 'admin' })
  }
  for (const g of granted ?? []) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    members.push({ id: g.id, name: g.name, email: g.email, department: g.department, kind: 'grant' })
  }
  members.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ members })
}
