import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from './supabase'
import { getStaffCount } from './staff-count'

export type InsightReport = {
  generated_at: string
  total_submissions: number
  pain_clusters: { theme: string; count: number; examples: string[]; office_spread: string[] }[]
  time_savings: { task: string; today: string; with_ai: string; saving: string; staff_name: string; office: string }[]
  skills_needed: { skill: string; count: number; departments: string[] }[]
  build_priority: { rank: number; title: string; rationale: string; impact: string }[]
  readiness_summary: { average: number; low: number; medium: number; high: number }
  raw_analysis: string
}

export type SavedReport = {
  id: string
  generated_at: string
  total_submissions: number
  trigger_type: 'manual' | 'cron'
  report: InsightReport
}

export async function generateInsightsReport(
  triggerType: 'manual' | 'cron' = 'manual'
): Promise<{ report: InsightReport } | { error: string; status: number }> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const { data: tasks, error: taskError } = await supabaseAdmin
    .from('staff_task_profiles')
    .select(`
      id, task_name, task_description, tools_used,
      time_taken_today, frequency, skill_needed, ai_readiness,
      staff_members ( name, office_id, department, role )
    `)
    .order('created_at', { ascending: true })

  if (taskError || !tasks?.length) {
    return { error: 'No task profiles found to analyse.', status: 400 }
  }

  const submissionsText = tasks.map((t, i) => {
    const member = Array.isArray(t.staff_members) ? t.staff_members[0] : t.staff_members
    return [
      `[${i + 1}] ${member?.name ?? 'Staff'} | ${member?.office_id ?? ''} office | ${member?.department ?? ''} | ${member?.role ?? ''}`,
      `    Task: ${t.task_name}`,
      t.task_description ? `    What they do: ${t.task_description}` : null,
      t.tools_used?.length   ? `    Tools: ${(t.tools_used as string[]).join(', ')}` : null,
      t.time_taken_today     ? `    Time today: ${t.time_taken_today}` : null,
      t.frequency            ? `    Frequency: ${t.frequency}` : null,
      t.skill_needed         ? `    Skill they want to learn: ${t.skill_needed}` : null,
      t.ai_readiness         ? `    Self-rated comfort with new tools: ${t.ai_readiness}/5` : null,
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  const staffCount = await getStaffCount()

  const prompt = `You are a senior AI strategy advisor analysing ${tasks.length} work profiles from Trescon — a B2B events company with 4 offices: Dubai, Bangalore, Mangalore, and Manipal (${staffCount} staff total). These profiles show what each staff member does, how long it takes today, what tools they use, and what new skills they want to learn.

Your job is to analyse all submissions and produce a structured intelligence report for Trescon's leadership team. The goal: identify where AI can save the most time, what to build first in Event Pilot (Trescon's internal AI learning and operations platform), and what training is needed.

IMPORTANT: For each task, estimate how long it would take with AI assistance based on your knowledge of current AI tools — do NOT ask staff this directly. Calculate this yourself from the task description and tools.

STAFF SUBMISSIONS:
${submissionsText}

Produce a JSON report with exactly this structure. Return ONLY valid JSON, no other text:

{
  "generated_at": "${new Date().toISOString()}",
  "total_submissions": ${tasks.length},
  "pain_clusters": [
    {
      "theme": "<cluster theme — shared pain these tasks represent>",
      "count": <number of staff affected>,
      "examples": ["<example task>", "<example task>"],
      "office_spread": ["Dubai", "Bangalore"]
    }
  ],
  "time_savings": [
    {
      "task": "<task name>",
      "today": "<time today as reported by staff>",
      "with_ai": "<your estimate of time with AI — be specific e.g. 8 minutes, 20 minutes>",
      "saving": "<e.g. saves 2.5 hours daily>",
      "staff_name": "<name>",
      "office": "<office label>"
    }
  ],
  "skills_needed": [
    {
      "skill": "<skill or AI tool needed>",
      "count": <number of staff>,
      "departments": ["<dept>"]
    }
  ],
  "build_priority": [
    {
      "rank": 1,
      "title": "<specific thing to build in Event Pilot>",
      "rationale": "<why this first — frequency, time saved, staff count>",
      "impact": "<estimated impact e.g. 240 hours/month saved across 12 staff>"
    }
  ],
  "readiness_summary": {
    "average": <1 decimal>,
    "low": <count 1-2>,
    "medium": <count 3>,
    "high": <count 4-5>
  },
  "raw_analysis": "<2-3 paragraphs plain-English strategic summary for leadership — what this data reveals and the single most important action to take>"
}`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { error: 'Could not parse analysis response.', status: 500 }
    }

    const report: InsightReport = JSON.parse(jsonMatch[0])

    await supabaseAdmin.from('intelligence_reports').insert({
      generated_at: new Date().toISOString(),
      total_submissions: tasks.length,
      report,
      trigger_type: triggerType,
    })

    return { report }
  } catch (err) {
    console.error('Gemini error:', err)
    return { error: 'Failed to generate analysis. Check GEMINI_API_KEY.', status: 500 }
  }
}
