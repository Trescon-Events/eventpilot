import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from './supabase'
import type { InsightReport } from './generateInsights'

export type WeeklyCourseResult = {
  generated: number
  courses: { title: string; tier_level: string; dept_tags: string[]; source_reason: string }[]
  skipped: number
  errors: string[]
}

/*
  Generates 2–3 draft courses every week:
    - 2 from the top skill gaps in the insights report
    - 1 from the latest AI releases/news (Gemini decides what's most relevant)
  All saved as status='draft', source='auto-weekly'.
  Super admin gets ONE consolidated notification.
*/
export async function generateWeeklyCourses(
  report: InsightReport
): Promise<WeeklyCourseResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const result: WeeklyCourseResult = { generated: 0, courses: [], skipped: 0, errors: [] }

  // ── Build the list of courses to generate ───────────────────────────────
  // Up to 2 from skills_needed (top 2 most requested)
  const topSkills = (report.skills_needed ?? [])
    .slice(0, 2)
    .map(s => ({
      suggestion: `Build a course teaching "${s.skill}" to staff in ${s.departments.join(' and ')} departments`,
      department: s.departments[0] ?? 'All',
      tier_level: 'foundation' as const,
      source_reason: `Top skill gap: ${s.skill} (requested by ${s.count} staff)`,
    }))

  // 1 from latest AI news — ask Gemini what's worth learning this week
  let aiNewsCourse: typeof topSkills[0] | null = null
  try {
    const newsPrompt = `You are an AI strategy advisor for Trescon Global, a B2B events company.
Today is ${new Date().toISOString().split('T')[0]}.

Identify the single most important recent AI tool, model, or technique released or updated in the last 2 weeks that would be practically useful for B2B events staff (e.g. account managers, marketing, operations, content).

Return ONLY valid JSON with exactly this structure, no other text:
{
  "tool_or_technique": "<name of AI tool or technique>",
  "why_relevant": "<one sentence: why this matters for B2B events work>",
  "department": "<most relevant department: Events / Marketing / Sales / HR / Finance / All>",
  "tier_level": "foundation",
  "course_suggestion": "<one sentence describing what the course should teach>"
}`

    const newsResult = await model.generateContent(newsPrompt)
    const newsText   = newsResult.response.text()
    const newsMatch  = newsText.match(/\{[\s\S]*\}/)
    if (newsMatch) {
      const newsData = JSON.parse(newsMatch[0])
      aiNewsCourse = {
        suggestion:    `Build a practical course on ${newsData.tool_or_technique}: ${newsData.course_suggestion}`,
        department:    newsData.department ?? 'All',
        tier_level:    newsData.tier_level ?? 'foundation',
        source_reason: `Latest AI release: ${newsData.tool_or_technique} — ${newsData.why_relevant}`,
      }
    }
  } catch (err) {
    result.errors.push(`AI news lookup failed: ${String(err)}`)
  }

  const coursesToGenerate = [
    ...topSkills,
    ...(aiNewsCourse ? [aiNewsCourse] : []),
  ]

  if (coursesToGenerate.length === 0) {
    result.errors.push('No courses to generate — no skill gaps in report and AI news lookup failed')
    return result
  }

  // ── Generate each course ─────────────────────────────────────────────────
  for (const item of coursesToGenerate) {
    try {
      const coursePrompt = `You are Pilot — the AI course designer for Event Pilot at Trescon Global, a B2B events company with 4 offices: Dubai, Bangalore, Mangalore, and Manipal.

An automated weekly system has identified the following training need:

SUGGESTION: ${item.suggestion}
TARGET DEPARTMENT: ${item.department}
TIER LEVEL: ${item.tier_level} (foundation = basics, adoption = intermediate workflows, advanced = strategy and leadership)

Design a complete, professional training course for Trescon staff. The course must be:
- Highly specific to the ${item.department} role at a B2B events company — not generic
- Practical: every task step must be something a ${item.department} staff member can do on their own system today
- Anti-shortcut: task steps must use {{department}} and {{role}} placeholders so each person gets a personalised task
- The question bank must have 10 questions that test genuine understanding, not recall. Include plausible wrong answers.

Return ONLY valid JSON with exactly this structure, no other text:

{
  "title": "<concise, specific course title>",
  "subtitle": "<one-line description of what they will be able to do>",
  "tool_name": "<primary AI tool used, or null if general>",
  "tier_level": "${item.tier_level}",
  "dept_tags": ["${item.department}"],
  "is_mandatory": false,
  "estimated_minutes": <number between 15 and 45>,
  "overview": "<2-3 paragraphs explaining why this matters for ${item.department} at Trescon>",
  "read_content": "<full reading content in markdown format. Minimum 600 words.>",
  "task_steps": [
    { "step": 1, "instruction": "<instruction using {{department}} and {{role}} placeholders>", "tip": "<tip>" },
    { "step": 2, "instruction": "<step 2>", "tip": "<tip>" },
    { "step": 3, "instruction": "<step 3>", "tip": "<tip>" },
    { "step": 4, "instruction": "<step 4 — produces concrete output for submission>", "tip": "<tip>" }
  ],
  "question_bank": [
    { "question": "<question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correct_index": <0-3>, "explanation": "<why correct>" }
  ]
}

The question_bank must have exactly 10 questions.`

      const courseResult = await model.generateContent(coursePrompt)
      const courseText   = courseResult.response.text()
      const courseMatch  = courseText.match(/\{[\s\S]*\}/)
      if (!courseMatch) {
        result.errors.push(`Could not parse course JSON for: ${item.suggestion.slice(0, 60)}`)
        result.skipped++
        continue
      }

      const course = JSON.parse(courseMatch[0])

      const { data: saved, error: saveError } = await supabaseAdmin
        .from('courses')
        .insert({
          ...course,
          source:             'auto-weekly',
          status:             'draft',
          suggested_by_name:  'Pilot AI',
          suggested_by_role:  'Weekly Intelligence Engine',
        })
        .select('id, title, tier_level, dept_tags')
        .single()

      if (saveError) {
        result.errors.push(`Save failed for "${course.title}": ${saveError.message}`)
        result.skipped++
        continue
      }

      result.generated++
      result.courses.push({
        title:         saved.title,
        tier_level:    saved.tier_level,
        dept_tags:     saved.dept_tags,
        source_reason: item.source_reason,
      })

    } catch (err) {
      result.errors.push(`Generation failed for "${item.suggestion.slice(0, 60)}": ${String(err)}`)
      result.skipped++
    }
  }

  // ── Notify super admin (single consolidated notification) ────────────────
  if (result.generated > 0) {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
    if (superAdminEmail) {
      const { data: superAdminStaff } = await supabaseAdmin
        .from('staff_members')
        .select('id')
        .eq('email', superAdminEmail)
        .single()

      const notifyId   = superAdminStaff?.id ?? 'super-admin'
      const courseList = result.courses.map(c => `• ${c.title} (${c.tier_level})`).join('\n')

      await supabaseAdmin.from('notifications').insert({
        staff_id: notifyId,
        type:     'course_pending',
        title:    `${result.generated} new course${result.generated > 1 ? 's' : ''} generated this week`,
        body:     `Pilot AI has built ${result.generated} new draft course${result.generated > 1 ? 's' : ''} based on your org's skill gaps and this week's AI developments. Open the Review Queue to approve or reject them.\n\n${courseList}`,
      })
    }
  }

  return result
}
