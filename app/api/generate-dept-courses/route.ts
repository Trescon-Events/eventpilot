import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 120

const TRESCON_DEPTS = [
  'Events', 'Sales & Sponsorship', 'Marketing', 'Content & Design',
  'Finance', 'HR', 'Operations', 'Data & Intelligence', 'Leadership',
]

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { department, tier_level = 'foundation', count = 2 } = body ?? {}

  if (!department || !TRESCON_DEPTS.includes(department)) {
    return NextResponse.json({ error: `department must be one of: ${TRESCON_DEPTS.join(', ')}` }, { status: 400 })
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const generated: { id: string; title: string; tier_level: string }[] = []
  const errors:    string[] = []

  for (let i = 0; i < Math.min(count, 3); i++) {
    try {
      const prompt = `You are Pilot — the AI course designer for Event Pilot at Trescon, a B2B events company with offices in Dubai, Bangalore, Mangalore, and Manipal.

Design course number ${i + 1} of ${count} for the ${department} team at Trescon.
Tier: ${tier_level} (foundation = basics, adoption = intermediate workflows, advanced = strategy)

Requirements:
- Highly specific to ${department} work at a B2B events company — not generic
- Each task must be something the staff member can do on their laptop today
- Anti-shortcut design: use {{department}} and {{role}} placeholders in task steps
- Question bank: 10 questions, plausible wrong answers, tests genuine understanding not recall
- Topic must NOT duplicate any of these common courses already built: Visual Design AI, Marketing Copywriting, Social Media AI, Brand Strategy AI, Content Production System

Return ONLY valid JSON with exactly this structure:
{
  "title": "<concise specific title for ${department} team>",
  "subtitle": "<one-line: what they will be able to do after this course>",
  "tool_name": "<primary AI tool or null>",
  "tier_level": "${tier_level}",
  "dept_tags": ["${department}"],
  "is_mandatory": false,
  "estimated_minutes": <15–40>,
  "overview": "<2–3 paragraphs: why this matters for ${department} at Trescon>",
  "read_content": "<full markdown reading content, minimum 500 words>",
  "task_steps": [
    { "step": 1, "instruction": "<uses {{department}} {{role}} placeholders>", "tip": "<tip>" },
    { "step": 2, "instruction": "<step 2>", "tip": "<tip>" },
    { "step": 3, "instruction": "<step 3>", "tip": "<tip>" },
    { "step": 4, "instruction": "<concrete output for submission>", "tip": "<tip>" }
  ],
  "question_bank": [
    { "question": "<q>", "options": ["A","B","C","D"], "correct_index": 0, "explanation": "<why>" }
  ]
}

question_bank must have exactly 10 questions.`

      const result    = await model.generateContent(prompt)
      const text      = result.response.text()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { errors.push(`Parse failed for course ${i + 1}`); continue }

      const course = JSON.parse(jsonMatch[0])

      const { data: saved, error: saveErr } = await supabaseAdmin
        .from('courses')
        .insert({
          ...course,
          source:            'dept-seed',
          status:            'draft',
          suggested_by_name: 'Pilot AI',
          suggested_by_role: 'Department Seeding Engine',
        })
        .select('id, title, tier_level')
        .single()

      if (saveErr) { errors.push(`Save failed: ${saveErr.message}`); continue }

      generated.push({ id: saved.id, title: saved.title, tier_level: saved.tier_level })

    } catch (err) {
      errors.push(`Generation error: ${String(err)}`)
    }
  }

  // Notify super admin
  if (generated.length > 0) {
    const superEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
    if (superEmail) {
      const { data: admin } = await supabaseAdmin.from('staff_members').select('id').eq('email', superEmail).single()
      if (admin?.id) {
        await supabaseAdmin.from('notifications').insert({
          staff_id: admin.id,
          type:     'course_draft_ready',
          title:    `${generated.length} new ${department} course${generated.length > 1 ? 's' : ''} ready for review`,
          body:     `Pilot AI generated ${generated.length} draft course${generated.length > 1 ? 's' : ''} for the ${department} team. Review and publish from the Review Queue.`,
          read:     false,
        })
      }
    }
  }

  return NextResponse.json({
    ok:        true,
    department,
    tier_level,
    generated: generated.length,
    courses:   generated,
    errors:    errors.length > 0 ? errors : undefined,
  })
}
