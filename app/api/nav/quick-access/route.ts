import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getAccessibleModuleKeys, checkAccess } from '@/app/lib/registry/access'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/nav/quick-access
  Returns everything the persistent global shell (app/components/GlobalShell.tsx)
  needs to decide which quick-access buttons to show, in one call:
  { toolkit, pilots, pilotsHref, isAdmin, teamDashboard, staffId }.

  toolkit: true for admins, or anyone granted at least one toolkitHub tool.
  pilots: true for admins (who see the full /admin/pilots roster), or
  anyone who is a pilot_project_members row on at least one project (who
  see their own /pilots "My Pilot Projects" view instead).
  isAdmin: gates the Admin Dashboard / HR Portal cross-module jump buttons.
  teamDashboard: gates the Team Dashboard jump button (admin OR manages at
  least one direct report) — mirrors the 'has_reports_or_admin' access kind
  the registry's own 'team-dashboard' entry uses.
  staffId: used to build the Team Dashboard href (/team?manager_id=X&staff_id=X).
*/
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ toolkit: false, pilots: false, pilotsHref: '/pilots', isAdmin: false, teamDashboard: false, staffId: null })

  const isAdmin = !!session.adm

  const toolkit = isAdmin || (await getAccessibleModuleKeys(session, 'toolkitHub')).length > 0

  let pilots = isAdmin
  if (!pilots) {
    const { count } = await supabaseAdmin
      .from('pilot_project_members')
      .select('*', { count: 'exact', head: true })
      .eq('staff_id', session.sid)
    pilots = (count ?? 0) > 0
  }

  const teamDashboard = await checkAccess({ kind: 'has_reports_or_admin' }, session)

  return NextResponse.json({
    toolkit, pilots, pilotsHref: isAdmin ? '/admin/pilots' : '/pilots',
    isAdmin, teamDashboard, staffId: session.sid,
  })
}
