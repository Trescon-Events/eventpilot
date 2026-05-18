import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

// POST { event_id }
// Returns AI-powered analysis of the current event checklist:
// - Risk flags (blocked/overdue tasks)
// - Per-department progress
// - Top priorities right now
// - Red flags and recommendations

export async function POST(req: NextRequest) {
  const { event_id } = await req.json().catch(() => ({}))
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Fetch event
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('name, type, city, event_date, expected_attendance')
    .eq('id', event_id)
    .single()

  // Fetch checklist
  const { data: checklist, error } = await supabaseAdmin
    .from('event_checklist')
    .select('id, department, workstream, title, status, priority, due_date, completed_at, depends_on, owner:owner_id(name)')
    .eq('event_id', event_id)
    .order('department')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!checklist?.length) return NextResponse.json({ error: 'No checklist found for this event' }, { status: 404 })

  // Compute dependency blocking
  const doneTitles = new Set(checklist.filter(t => t.status === 'done').map(t => t.title))
  const today = new Date().toISOString().slice(0, 10)

  const tasks = checklist.map(t => ({
    department:  t.department,
    workstream:  t.workstream ?? '',
    title:       t.title,
    status:      t.status,
    priority:    t.priority,
    due_date:    t.due_date ?? 'not set',
    is_overdue:  t.due_date && t.status !== 'done' && t.due_date < today,
    is_blocked:  t.depends_on ? !doneTitles.has(t.depends_on) && t.status !== 'done' : false,
    blocked_by:  t.depends_on && !doneTitles.has(t.depends_on) ? t.depends_on : null,
    owner:       (t.owner as unknown as { name: string } | null)?.name ?? 'Unassigned',
  }))

  // Compute stats
  const total     = tasks.length
  const done      = tasks.filter(t => t.status === 'done').length
  const inProg    = tasks.filter(t => t.status === 'in_progress').length
  const overdue   = tasks.filter(t => t.is_overdue).length
  const blocked   = tasks.filter(t => t.is_blocked).length
  const critical  = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length
  const pct       = Math.round((done / total) * 100)

  const byDept: Record<string, { total: number; done: number; blocked: number; critical_open: number }> = {}
  for (const t of tasks) {
    if (!byDept[t.department]) byDept[t.department] = { total: 0, done: 0, blocked: 0, critical_open: 0 }
    byDept[t.department].total++
    if (t.status === 'done') byDept[t.department].done++
    if (t.is_blocked) byDept[t.department].blocked++
    if (t.priority === 'critical' && t.status !== 'done') byDept[t.department].critical_open++
  }

  const weeksOut = event?.event_date
    ? Math.round((new Date(event.event_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))
    : null

  // Build AI prompt
  const prompt = `You are the AI planning intelligence for Trescon Global, a B2B events company.

Analyze the current planning state for this event and return a JSON response.

EVENT:
- Name: ${event?.name ?? 'Unknown'}
- Type: ${event?.type ?? 'Conference'}
- City: ${event?.city ?? 'TBD'}
- Date: ${event?.event_date ?? 'TBD'}${weeksOut !== null ? ` (${weeksOut} weeks away)` : ''}
- Expected attendance: ${event?.expected_attendance ?? 'TBD'}

OVERALL PROGRESS: ${done}/${total} tasks done (${pct}%)
- In progress: ${inProg}
- Overdue: ${overdue}
- Blocked (dependency not done): ${blocked}
- Critical tasks still open: ${critical}

DEPARTMENT BREAKDOWN:
${Object.entries(byDept).map(([dept, s]) =>
  `- ${dept}: ${s.done}/${s.total} done${s.blocked > 0 ? `, ${s.blocked} blocked` : ''}${s.critical_open > 0 ? `, ${s.critical_open} critical open` : ''}`
).join('\n')}

BLOCKED TASKS (dependency not done):
${tasks.filter(t => t.is_blocked).map(t => `- [${t.department}] "${t.title}" blocked by: "${t.blocked_by}"`).join('\n') || 'None'}

OVERDUE TASKS:
${tasks.filter(t => t.is_overdue).map(t => `- [${t.department}] "${t.title}" (due: ${t.due_date})`).join('\n') || 'None'}

OPEN CRITICAL TASKS:
${tasks.filter(t => t.priority === 'critical' && t.status !== 'done').map(t => `- [${t.department}] "${t.title}" — ${t.status}`).join('\n') || 'None'}

Return ONLY valid JSON with this exact shape:
{
  "health": "on_track" | "at_risk" | "critical",
  "health_summary": "One sentence overall assessment",
  "top_priorities": [
    { "task": "task title", "department": "dept", "reason": "why this is urgent" }
  ],
  "risk_flags": [
    { "type": "blocked" | "overdue" | "critical_open" | "dependency_chain", "title": "task title", "department": "dept", "impact": "what happens if not resolved", "action": "what to do right now" }
  ],
  "department_insights": [
    { "department": "dept name", "status": "on_track" | "at_risk" | "critical", "insight": "1 sentence" }
  ],
  "ai_recommendation": "2-3 sentence overall recommendation for the event director"
}

Rules:
- top_priorities: max 5, most urgent actions right now
- risk_flags: only real risks, max 8
- department_insights: one per department, honest assessment
- Be specific — reference actual task names and departments
- If ${weeksOut !== null && weeksOut < 8 ? `only ${weeksOut} weeks remain, escalate urgency` : 'timeline is reasonable, be constructive'}`

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    const json   = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const analysis = JSON.parse(json)

    return NextResponse.json({
      ...analysis,
      stats: { total, done, inProg, overdue, blocked, critical, pct },
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    // Fallback if Gemini fails — return computed stats with basic analysis
    const health = overdue > 3 || blocked > 5 || (critical > 0 && pct < 30) ? 'critical'
                 : overdue > 0 || blocked > 0 || critical > 0 ? 'at_risk'
                 : 'on_track'

    return NextResponse.json({
      health,
      health_summary: `${pct}% complete. ${overdue} overdue, ${blocked} blocked, ${critical} critical tasks open.`,
      top_priorities: tasks
        .filter(t => t.priority === 'critical' && t.status !== 'done')
        .slice(0, 5)
        .map(t => ({ task: t.title, department: t.department, reason: 'Critical priority, not yet done' })),
      risk_flags: [
        ...tasks.filter(t => t.is_overdue).map(t => ({ type: 'overdue' as const, title: t.title, department: t.department, impact: 'Delays downstream tasks', action: 'Assign owner and set new due date immediately' })),
        ...tasks.filter(t => t.is_blocked).map(t => ({ type: 'blocked' as const, title: t.title, department: t.department, impact: `Blocked by: ${t.blocked_by}`, action: `Complete "${t.blocked_by}" first` })),
      ].slice(0, 8),
      department_insights: Object.entries(byDept).map(([dept, s]) => ({
        department: dept,
        status: s.critical_open > 0 ? 'critical' : s.blocked > 0 ? 'at_risk' : 'on_track',
        insight: `${s.done}/${s.total} tasks done${s.blocked > 0 ? `, ${s.blocked} blocked` : ''}.`,
      })),
      ai_recommendation: `Focus on unblocking the ${blocked} blocked tasks and clearing ${overdue} overdue items. ${critical} critical tasks remain open.`,
      stats: { total, done, inProg, overdue, blocked, critical, pct },
      generated_at: new Date().toISOString(),
      fallback: true,
    })
  }
}
