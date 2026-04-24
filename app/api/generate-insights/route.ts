import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function POST() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  // Fetch all task profiles with member details
  const { data: tasks, error: taskError } = await supabaseAdmin
    .from('staff_task_profiles')
    .select(`
      id, task_name, task_description, tools_used,
      time_taken_today, frequency, skill_needed, ai_readiness,
      staff_members ( name, office_id, department, role )
    `)
    .order('created_at', { ascending: true })

  if (taskError || !tasks?.length) {
    return NextResponse.json({ error: 'No task profiles found to analyse.' }, { status: 400 })
  }

  // Format data for Gemini
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

  const prompt = `You are a senior AI strategy advisor analysing ${tasks.length} work profiles from Trescon Global — a B2B events company with 4 offices: Dubai, Bangalore, Mangalore, and Manipal (184 staff total). These profiles show what each staff member does, how long it takes today, what tools they use, and what new skills they want to learn.

Your job is to analyse all submissions and produce a structured intelligence report for Trescon's leadership team. The goal: identify where AI can save the most time, what to build first in TAOS (Trescon AI Operating System), and what training is needed.

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
      "title": "<specific thing to build in TAOS>",
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

    // Extract JSON — Gemini sometimes wraps in markdown code blocks
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse analysis response.' }, { status: 500 })
    }

    const report = JSON.parse(jsonMatch[0])
    return NextResponse.json({ report })

  } catch (err) {
    console.error('Gemini error:', err)
    return NextResponse.json({ error: 'Failed to generate analysis. Check GEMINI_API_KEY.' }, { status: 500 })
  }
}
