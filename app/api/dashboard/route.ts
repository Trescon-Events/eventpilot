import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { getCachedCourses, CachedCourse } from '@/app/lib/courseCache'
import { computeTAIRS, getTrack } from '@/app/lib/tairs'

/* ── Recommendation engine (pure JS — no external calls) ─────────────── */
const MGMT_LEVELS    = ['team_lead', 'dept_head', 'office_head', 'super_admin']
const MGMT_KEYWORDS  = ['team', 'strategy', 'leadership', 'manager', 'automation', 'studio']

type RecLabel = 'mandatory' | 'dept' | 'track' | 'foundation_gap' | 'role'

function recReason(label: RecLabel, dept: string | null, track: string): string {
  switch (label) {
    case 'mandatory':      return 'Required for all staff'
    case 'dept':           return `Recommended for ${dept ?? 'your department'}`
    case 'track':          return `Next in your ${track} track`
    case 'foundation_gap': return 'Complete your foundation first'
    case 'role':           return 'Relevant to your management role'
  }
}

function computeRecommendations(
  dept:         string | null,
  jobLevel:     string | null,
  track:        string,
  completedIds: Set<string>,
  allCourses:   CachedCourse[],
  limit:        number,
) {
  const foundationDone  = allCourses.filter(c => c.tier_level === 'foundation' && completedIds.has(c.id)).length
  const hasFoundationGap = track !== 'foundation' && foundationDone < 3
  const isManagement     = MGMT_LEVELS.includes(jobLevel ?? '')
  const uncompleted      = allCourses.filter(c => !completedIds.has(c.id))

  const scored = uncompleted.map(course => {
    let score = 0
    let label: RecLabel = 'track'

    if (course.is_mandatory) { score += 50; label = 'mandatory' }
    if (course.tier_level === track) score += 30

    const deptMatch = dept && (course.dept_tags.length === 0 || course.dept_tags.includes(dept))
    if (deptMatch) {
      score += 25
      if (label !== 'mandatory' && course.dept_tags.includes(dept ?? '')) label = 'dept'
    }

    if (hasFoundationGap && course.tier_level === 'foundation') {
      score += 20
      if (label === 'track') label = 'foundation_gap'
    }

    if (isManagement) {
      const tl = course.title.toLowerCase()
      if (MGMT_KEYWORDS.some(k => tl.includes(k))) {
        score += 15
        if (label === 'track') label = 'role'
      }
    }

    if (track === 'foundation' && course.tier_level === 'advanced') score -= 20
    if (track === 'foundation' && course.tier_level === 'adoption')  score -= 10

    return { ...course, rec_score: score, rec_label: label, rec_reason: recReason(label, dept, track) }
  })

  scored.sort((a, b) => b.rec_score - a.rec_score)

  const mandatoryTotal     = allCourses.filter(c => c.is_mandatory).length
  const mandatoryCompleted = allCourses.filter(c => c.is_mandatory && completedIds.has(c.id)).length
  const deptCourses        = dept ? allCourses.filter(c => c.dept_tags.includes(dept)).length : 0
  const deptCompleted      = dept ? allCourses.filter(c => c.dept_tags.includes(dept) && completedIds.has(c.id)).length : 0

  return {
    primary: scored[0] ?? null,
    list:    scored.slice(1, limit),
    context: { mandatory_total: mandatoryTotal, mandatory_completed: mandatoryCompleted, dept_courses: deptCourses, dept_completed: deptCompleted },
  }
}

/* ── GET /api/dashboard?id=STAFF_UUID ───────────────────────────────── */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  /* Super-admin synthetic session */
  if (id === 'super-admin') {
    const [allCourses, completionsRes] = await Promise.all([
      getCachedCourses(),
      supabaseAdmin.from('course_completions').select('course_id, passed, test_score, attempt_count').eq('staff_id', id),
    ])
    const completions = completionsRes.data ?? []
    const completedIds = new Set(completions.filter(c => c.passed).map(c => c.course_id))
    const recommendations = computeRecommendations(null, 'super_admin', 'foundation', completedIds, allCourses, 6)
    return NextResponse.json({
      staff: {
        id: 'super-admin', name: 'Super Admin', email: process.env.SUPER_ADMIN_EMAIL ?? '',
        department: null, role: 'Super Admin · Leadership', office_id: null, profile_complete: true,
        joined_at: null, manager_id: null, job_level: 'super_admin', team: null, has_reports: true,
      },
      tasks:           [],
      courses:         allCourses,
      completions,
      recommendations,
    })
  }

  /* ── All 6 DB queries fire in parallel ─────────────────────────────── */
  const [staffRes, tasksRes, completionsRes, allCourses, reportCountRes, notificationsRes] = await Promise.all([
    supabaseAdmin
      .from('staff_members')
      .select('id, name, email, department, role, office_id, profile_complete, joined_at, manager_id, job_level, team, toolkit_access, tool_grants')
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('staff_task_profiles')
      .select('ai_readiness, tools_used, tool_proficiency')
      .eq('staff_id', id),
    supabaseAdmin
      .from('course_completions')
      .select('course_id, passed, test_score, attempt_count, courses(tier_level)')
      .eq('staff_id', id),
    getCachedCourses(),
    supabaseAdmin
      .from('staff_members')
      .select('*', { count: 'exact', head: true })
      .eq('manager_id', id),
    supabaseAdmin
      .from('notifications')
      .select('id, type, title, body, course_id, created_at')
      .eq('staff_id', id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (staffRes.error || !staffRes.data) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  const staff      = { ...staffRes.data, has_reports: (reportCountRes.count ?? 0) > 0 }
  const tasks      = tasksRes.data ?? []
  const completions = completionsRes.data ?? []

  const score      = computeTAIRS(tasks, completions as unknown as { passed: boolean; courses?: { tier_level: string } | null }[])
  const track      = getTrack(score)
  const completedIds = new Set(completions.filter(c => c.passed).map(c => c.course_id))

  /* Recommendations — pure JS, computed from already-fetched data, zero extra DB calls */
  const recommendations = computeRecommendations(staff.department, staff.job_level, track, completedIds, allCourses, 6)

  const notifications = notificationsRes.data ?? []

  /* Return all courses — dashboard shows full library count and correct mandatory total */
  return NextResponse.json({ staff, tasks, courses: allCourses, completions, recommendations, notifications })
}
