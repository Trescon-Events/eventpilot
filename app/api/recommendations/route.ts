import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getCachedCourses } from '@/app/lib/courseCache'
import { computeTAIRS, getTier, getTrack } from '@/app/lib/tairs'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

/*
  POST /api/recommendations
  Body: { staff_id: string }

  Returns AI-personalised course recommendations via Gemini.
  Pre-filters courses by eligibility (tier, completion), then sends
  staff profile + task data to Gemini for ranking + one-sentence reasons.
*/
export async function POST(req: NextRequest) {
  const { staff_id } = await req.json().catch(() => ({}))
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  /* Fetch everything needed in parallel */
  const [staffRes, tasksRes, completionsRes, allCourses] = await Promise.all([
    supabaseAdmin
      .from('staff_members')
      .select('id, name, role, department, job_level')
      .eq('id', staff_id)
      .single(),
    supabaseAdmin
      .from('staff_task_profiles')
      .select('task_name, task_description, tools_used, skill_needed, ai_readiness, frequency')
      .eq('staff_id', staff_id),
    supabaseAdmin
      .from('course_completions')
      .select('course_id, passed')
      .eq('staff_id', staff_id),
    getCachedCourses(),
  ])

  if (staffRes.error || !staffRes.data) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  const staff        = staffRes.data
  const tasks        = tasksRes.data ?? []
  const completions  = completionsRes.data ?? []
  const completedIds = new Set(completions.filter(c => c.passed).map(c => c.course_id))

  const score = computeTAIRS(tasks)
  const tier  = getTier(score)
  const track = getTrack(score)

  /* Pre-filter: not completed + tier-appropriate (current track or one above) */
  const tierOrder = ['foundation', 'adoption', 'advanced']
  const trackIdx  = tierOrder.indexOf(track)
  const eligible  = allCourses.filter(c =>
    !completedIds.has(c.id) &&
    tierOrder.indexOf(c.tier_level) <= Math.min(trackIdx + 1, 2)
  )

  /* Cap at 20 — mandatory first, then dept-matched, then rest */
  const sorted = [
    ...eligible.filter(c => c.is_mandatory),
    ...eligible.filter(c => !c.is_mandatory && staff.department && c.dept_tags.includes(staff.department)),
    ...eligible.filter(c => !c.is_mandatory && !(staff.department && c.dept_tags.includes(staff.department))),
  ].slice(0, 20)

  if (sorted.length === 0) {
    return NextResponse.json({ recommendations: [] })
  }

  /* Build task summary */
  const taskSummary = tasks.length > 0
    ? tasks.slice(0, 5).map(t =>
        `- ${t.task_name}${t.task_description ? ': ' + t.task_description : ''}` +
        `${t.tools_used?.length ? ' | Tools: ' + t.tools_used.join(', ') : ''}` +
        `${t.ai_readiness != null ? ' | AI readiness self-rating: ' + t.ai_readiness + '/5' : ''}`
      ).join('\n')
    : 'No task profile submitted yet.'

  const completedTitles = allCourses
    .filter(c => completedIds.has(c.id))
    .map(c => c.title)
    .slice(0, 10)

  const courseList = sorted.map((c, i) =>
    `${i + 1}. [ID: ${c.id}] "${c.title}"` +
    ` — ${c.subtitle ?? 'No subtitle'}` +
    ` | Tier: ${c.tier_level}` +
    ` | Dept tags: ${c.dept_tags.join(', ') || 'general'}` +
    ` | ${c.estimated_minutes} min` +
    `${c.is_mandatory ? ' | MANDATORY' : ''}`
  ).join('\n')

  const prompt = `You are a learning advisor for Trescademy, an AI readiness training platform inside Trescon.

STAFF PROFILE:
- Name: ${staff.name}
- Role: ${staff.role ?? 'Not specified'}
- Department: ${staff.department ?? 'Not specified'}
- Job Level: ${staff.job_level}
- TAIRS Score: ${score}/100 — Tier: ${tier} — Learning Track: ${track}

THEIR DAILY WORK (from submitted task profile):
${taskSummary}

COURSES THEY HAVE ALREADY COMPLETED:
${completedTitles.length > 0 ? completedTitles.join(', ') : 'None yet.'}

COURSES AVAILABLE TO RECOMMEND (choose from these only):
${courseList}

YOUR TASK:
Pick exactly 5 courses from the list above that will genuinely help this person right now given their role, tasks, and current AI readiness level. For each chosen course, write ONE sentence explaining specifically why it is right for them — mention their role, department, or a specific task they do. Be concrete, not generic. Do not say "this course will help you" — say what it will actually change.

Return ONLY a valid JSON array, no markdown fences, no explanation outside the array:
[
  { "course_id": "the-exact-uuid-from-the-list", "reason": "one specific sentence" },
  { "course_id": "...", "reason": "..." },
  { "course_id": "...", "reason": "..." },
  { "course_id": "...", "reason": "..." },
  { "course_id": "...", "reason": "..." }
]`

  try {
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    const raw    = result.response.text().trim()

    /* Strip markdown fences if Gemini wraps in them */
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let picks: { course_id: string; reason: string }[] = []
    try {
      picks = JSON.parse(clean)
    } catch {
      console.error('Failed to parse Gemini JSON:', clean)
      return NextResponse.json({ error: 'AI response parse failed' }, { status: 500 })
    }

    /* Merge back full course data, validate IDs exist */
    const courseMap = new Map(allCourses.map(c => [c.id, c]))
    const recommendations = picks
      .filter(p => p.course_id && courseMap.has(p.course_id))
      .map(p => ({
        ...courseMap.get(p.course_id)!,
        rec_reason: p.reason,
        rec_label:  'ai' as const,
      }))

    return NextResponse.json({ recommendations })
  } catch (err) {
    console.error('Recommendations Gemini error:', err)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(err)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'AI recommendation failed' }, { status: 500 })
  }
}
