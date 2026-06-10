import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { computeAIRS, getTier, getTrack } from '@/app/lib/airs'

/* GET /api/team?manager_id=UUID
   Returns all staff under a manager at any depth, with AIRS + completion data.
   Uses in-memory hierarchy traversal — works cleanly up to ~1000 staff. */

type StaffRow = {
  id: string
  name: string
  email: string
  department: string | null
  role: string | null
  office_id: string
  job_level: string
  team: string | null
  manager_id: string | null
}

function getTeamUnder(managerId: string, allStaff: StaffRow[], visited = new Set<string>()): StaffRow[] {
  if (visited.has(managerId)) return [] // guard against circular manager references in bad data
  visited.add(managerId)
  const direct = allStaff.filter(s => s.manager_id === managerId)
  const result: StaffRow[] = []
  for (const member of direct) {
    result.push(member)
    result.push(...getTeamUnder(member.id, allStaff, visited))
  }
  return result
}

export async function GET(req: NextRequest) {
  const managerId = req.nextUrl.searchParams.get('manager_id')
  if (!managerId) return NextResponse.json({ error: 'manager_id required' }, { status: 400 })

  // Fetch all staff (needed for recursive traversal + super admin full-org view)
  const { data: allStaff, error: allErr } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, office_id, job_level, team, manager_id')

  if (allErr || !allStaff) return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })

  // Super admin synthetic session — sees entire org
  let manager: StaffRow
  let teamMembers: StaffRow[]

  if (managerId === 'super-admin') {
    manager = {
      id:         'super-admin',
      name:       'Super Admin',
      email:      process.env.SUPER_ADMIN_EMAIL ?? '',
      department: null,
      role:       'Super Admin',
      office_id:  'all',
      job_level:  'super_admin',
      team:       null,
      manager_id: null,
    }
    teamMembers = allStaff
  } else {
    // Fetch the manager's own record
    const { data: mgr, error: mErr } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email, department, role, office_id, job_level, team, manager_id')
      .eq('id', managerId)
      .single()

    if (mErr || !mgr) return NextResponse.json({ error: 'Manager not found' }, { status: 404 })
    manager     = mgr
    teamMembers = getTeamUnder(managerId, allStaff)
  }

  if (teamMembers.length === 0) {
    return NextResponse.json({ manager, members: [], total: 0 })
  }

  const teamIds = teamMembers.map(m => m.id)

  // Fetch AIRS data (task profiles) for all team members in one query
  const { data: taskProfiles } = await supabaseAdmin
    .from('staff_task_profiles')
    .select('staff_id, ai_readiness')
    .in('staff_id', teamIds)

  // Fetch completions for all team members in one query (with tier_level for accurate AIRS)
  const { data: completions } = await supabaseAdmin
    .from('course_completions')
    .select('staff_id, course_id, passed, completed_at, courses(tier_level)')
    .in('staff_id', teamIds)

  type TairsCompletion = { passed: boolean; courses?: { tier_level: string } | null }
  type CompletionRow   = { staff_id: string; passed: boolean; completed_at: string } & TairsCompletion

  // Group by staff_id
  const taskMap: Record<string, number[]> = {}
  for (const t of taskProfiles ?? []) {
    if (!taskMap[t.staff_id]) taskMap[t.staff_id] = []
    taskMap[t.staff_id].push(t.ai_readiness ?? 1)
  }

  const completionsByStaff: Record<string, TairsCompletion[]> = {}
  const completionMap: Record<string, number> = {}
  const lastActiveMap: Record<string, string> = {}
  for (const c of (completions as unknown as CompletionRow[] ?? [])) {
    if (!completionsByStaff[c.staff_id]) completionsByStaff[c.staff_id] = []
    completionsByStaff[c.staff_id].push(c)
    if (c.passed) {
      completionMap[c.staff_id] = (completionMap[c.staff_id] ?? 0) + 1
      if (!lastActiveMap[c.staff_id] || c.completed_at > lastActiveMap[c.staff_id]) {
        lastActiveMap[c.staff_id] = c.completed_at
      }
    }
  }

  const members = teamMembers.map(m => {
    const score = computeAIRS(
      (taskMap[m.id] ?? []).map(r => ({ ai_readiness: r })),
      completionsByStaff[m.id] ?? [],
    )
    const tier  = getTier(score)
    return {
      ...m,
      tairs_score:       score,
      tier,
      track:             getTrack(score),
      completed_courses: completionMap[m.id] ?? 0,
      last_active:       lastActiveMap[m.id] ?? null,
      direct_report_of:  m.manager_id,
    }
  })

  return NextResponse.json({ manager, members, total: members.length })
}
