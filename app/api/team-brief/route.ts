import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { computeTAIRS, getTier } from '@/app/lib/tairs'

type StaffRow = {
  id:               string
  name:             string
  department:       string | null
  role:             string | null
  office_id:        string
  job_level:        string
  manager_id:       string | null
  profile_complete: boolean
}

function getTeamUnder(managerId: string, allStaff: StaffRow[], visited = new Set<string>()): StaffRow[] {
  if (visited.has(managerId)) return []
  visited.add(managerId)
  const direct = allStaff.filter(s => s.manager_id === managerId)
  const result: StaffRow[] = []
  for (const m of direct) {
    result.push(m)
    result.push(...getTeamUnder(m.id, allStaff, visited))
  }
  return result
}

/* POST /api/team-brief
   Body: { manager_id: string }
   Returns: { brief: string, stats: object, gap_dept: string | null }
*/
export async function POST(req: NextRequest) {
  const { manager_id } = await req.json().catch(() => ({}))
  if (!manager_id) return NextResponse.json({ error: 'manager_id required' }, { status: 400 })

  /* ── Fetch everything in parallel ── */
  const [allStaffRes, taskRes, completionRes] = await Promise.all([
    supabaseAdmin
      .from('staff_members')
      .select('id, name, department, role, office_id, job_level, manager_id, profile_complete'),
    supabaseAdmin
      .from('staff_task_profiles')
      .select('staff_id, ai_readiness'),
    supabaseAdmin
      .from('course_completions')
      .select('staff_id, passed')
      .eq('passed', true),
  ])

  const allStaff = (allStaffRes.data ?? []) as StaffRow[]

  /* ── Resolve manager info + team scope ── */
  let managerName = 'Super Admin'
  let managerRole = 'Super Admin'
  let teamMembers: StaffRow[]

  if (manager_id === 'super-admin') {
    teamMembers = allStaff
  } else {
    const mgr = allStaff.find(s => s.id === manager_id)
    if (!mgr) return NextResponse.json({ error: 'Manager not found' }, { status: 404 })
    managerName = mgr.name
    managerRole = mgr.role ?? mgr.job_level
    teamMembers  = getTeamUnder(manager_id, allStaff)
  }

  if (teamMembers.length === 0) {
    return NextResponse.json({ error: 'No team members found under this manager.' }, { status: 400 })
  }

  /* ── Build lookup maps ── */
  const taskMap: Record<string, number[]> = {}
  for (const t of taskRes.data ?? []) {
    if (!taskMap[t.staff_id]) taskMap[t.staff_id] = []
    taskMap[t.staff_id].push(t.ai_readiness ?? 1)
  }

  const completionCount: Record<string, number> = {}
  for (const c of completionRes.data ?? []) {
    completionCount[c.staff_id] = (completionCount[c.staff_id] ?? 0) + 1
  }

  /* ── Score each member ── */
  const scored = teamMembers.map(m => {
    const tasks = (taskMap[m.id] ?? []).map(r => ({ ai_readiness: r }))
    const score = computeTAIRS(tasks)
    return { ...m, score, tier: getTier(score), completedCourses: completionCount[m.id] ?? 0 }
  })

  /* ── Aggregate stats ── */
  const avgScore    = Math.round(scored.reduce((s, m) => s + m.score, 0) / scored.length)
  const noProfile   = teamMembers.filter(m => !m.profile_complete).length
  const zeroCourses = scored.filter(m => m.completedCourses === 0).length
  const totalCourses = scored.reduce((s, m) => s + m.completedCourses, 0)

  const tierDist: Record<string, number> = {}
  for (const m of scored) tierDist[m.tier] = (tierDist[m.tier] ?? 0) + 1

  const deptScores: Record<string, number[]> = {}
  for (const m of scored) {
    const dept = m.department ?? 'Unknown'
    if (!deptScores[dept]) deptScores[dept] = []
    deptScores[dept].push(m.score)
  }

  const deptAvgs = Object.entries(deptScores)
    .map(([dept, scores]) => ({
      dept,
      avg:   Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      count: scores.length,
    }))
    .sort((a, b) => a.avg - b.avg) // weakest first

  const gapDept     = deptAvgs[0]?.dept ?? null
  const gapDeptScore = deptAvgs[0]?.avg ?? null

  /* ── Build Gemini prompt ── */
  const prompt = `You are writing a concise Team AI Readiness Brief for ${managerName} (${managerRole}).

TEAM DATA — ${scored.length} people:
- Average TAIRS Score: ${avgScore}/100 (industry baseline 25–40, Trescon target 60+)
- Tier breakdown: ${Object.entries(tierDist).map(([t, n]) => `${n} ${t}`).join(', ')}
- Total courses completed across team: ${totalCourses}
- Members with zero completed courses: ${zeroCourses}/${scored.length}
- Members yet to complete their work profile: ${noProfile}/${scored.length}

DEPARTMENT SCORES (lowest → highest):
${deptAvgs.map(d => `- ${d.dept}: avg ${d.avg}/100 (${d.count} people)`).join('\n')}

Write a Team Health Brief with exactly this structure — no extra headings, no emojis:

1. OVERVIEW (one paragraph, 3–4 sentences): Where the team stands right now. Use real numbers. Be direct about what the score means.

2. BIGGEST GAP (one paragraph, 3–4 sentences): Name the department or group that needs the most attention. What does the data show? Why does it matter for Trescon?

3. THIS WEEK'S ACTIONS (exactly 3 bullet points): Specific, concrete steps the manager can take in the next 7 days. Not generic — use the actual data above.

4. PLATFORM IMPACT (one sentence): How this team's engagement directly shapes what gets built on Trescademy next.

Be direct, professional, and encouraging — not corporate. Use the actual numbers.`

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    const brief  = result.response.text()

    return NextResponse.json({
      brief,
      stats: {
        teamSize:      scored.length,
        avgScore,
        totalCourses,
        zeroCourses,
        noProfile,
        tierDist,
      },
      gap_dept:       gapDept,
      gap_dept_score: gapDeptScore,
    })
  } catch (err) {
    console.error('Team brief Gemini error:', err)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(err)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'AI service unavailable. Please try again.' }, { status: 500 })
  }
}
