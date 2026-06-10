import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

export async function POST(req: NextRequest) {
  const { admin_code, suggestion, department, tier_level } = await req.json()

  if (admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!suggestion || !department || !tier_level) {
    return NextResponse.json({ error: 'suggestion, department, and tier_level are required.' }, { status: 400 })
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are Pilot — the AI course designer for Event Pilot at Trescon Global, a B2B events company with 4 offices: Dubai, Bangalore, Mangalore, and Manipal.

An admin has requested a new course with the following brief:

SUGGESTION: ${suggestion}
TARGET DEPARTMENT: ${department}
TIER LEVEL: ${tier_level} (foundation = basics, adoption = intermediate workflows, advanced = strategy and leadership)

Design a complete, professional training course for Trescon staff in the ${department} department. The course must be:
- Highly specific to the ${department} role at a B2B events company — not generic
- Practical: every task step must be something a ${department} staff member can do on their own system today
- Anti-shortcut: task steps must use {{department}} and {{role}} placeholders so each person gets a personalised task that cannot be shared with a colleague
- The question bank must have 10 questions that test genuine understanding, not recall. Include plausible wrong answers.

Return ONLY valid JSON with exactly this structure, no other text:

{
  "title": "<concise, specific course title>",
  "subtitle": "<one-line description of what they will be able to do>",
  "tool_name": "<primary AI tool used, or null if general>",
  "tier_level": "${tier_level}",
  "dept_tags": ["${department}"],
  "is_mandatory": false,
  "estimated_minutes": <number between 15 and 45>,
  "overview": "<2-3 paragraphs explaining why this matters specifically for ${department} at Trescon. Make it motivating and concrete.>",
  "read_content": "<full reading content in markdown format. Use # headings, ## subheadings, - bullet points, > blockquotes for examples, **bold** for emphasis. Minimum 600 words. Include real techniques, tools, and Trescon-relevant examples.>",
  "task_steps": [
    {
      "step": 1,
      "instruction": "<specific instruction using {{department}} and {{role}} placeholders so it is personalised — e.g. 'As a {{role}} in {{department}}, open ChatGPT and write a prompt for...' Must be something they actually do on their system.>",
      "tip": "<practical tip that helps them succeed>"
    },
    {
      "step": 2,
      "instruction": "<step 2 — must differ from step 1 and build on it>",
      "tip": "<tip>"
    },
    {
      "step": 3,
      "instruction": "<step 3>",
      "tip": "<tip>"
    },
    {
      "step": 4,
      "instruction": "<step 4 — should produce a concrete output they paste as their submission evidence>",
      "tip": "<tip>"
    }
  ],
  "question_bank": [
    {
      "question": "<question testing genuine understanding>",
      "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correct_index": <0-3>,
      "explanation": "<why this is correct — 1-2 sentences>"
    }
  ]
}

The question_bank must have exactly 10 questions. All questions must test understanding of the course content — not trivia or memorisation. Wrong answer options must be plausible, not obviously wrong.`

  try {
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse course from Gemini.' }, { status: 500 })
    const course = JSON.parse(jsonMatch[0])
    return NextResponse.json({ course })
  } catch (err) {
    console.error('Gemini course generation error:', err)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(err)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'Failed to generate course. Try again.' }, { status: 500 })
  }
}
