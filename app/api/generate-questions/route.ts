import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

/*
  POST /api/generate-questions
  Generates 5 personalised questions based on the staff member's
  actual submission — not generic MCQ from the question bank.
  Each question references what THEY specifically did or wrote.
*/
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { course_title, course_overview, task_steps, submission } = body as {
    course_title:   string
    course_overview: string
    task_steps:     { step: number; instruction: string }[]
    submission:     string
  }

  if (!submission?.trim()) {
    return NextResponse.json({ error: 'Submission is required' }, { status: 400 })
  }

  const taskList = task_steps.map(t => `${t.step}. ${t.instruction}`).join('\n')

  const prompt = `You are generating a personalised knowledge test for a staff member on a corporate AI learning platform called Event Pilot.

Course: ${course_title}
Overview: ${course_overview}
Tasks the staff completed:
${taskList}

What this specific staff member submitted as their work output:
"""
${submission.slice(0, 1500)}
"""

Generate exactly 5 multiple choice questions that test whether this specific person genuinely understood and applied the course content based on THEIR SPECIFIC SUBMISSION above.

Critical rules:
- At least 3 questions MUST directly reference or relate to choices they made in their submission
- Questions test understanding and real-world application — not definitions
- Include plausible-sounding wrong answers that someone who copy-pasted from AI would choose
- Someone who actually did the work and reflected on it should answer correctly
- Someone who faked the submission should find the questions difficult
- Each question has exactly 4 options, one correct answer

Return ONLY a valid JSON array, nothing else:
[
  {
    "question": "question text here",
    "options": ["option A", "option B", "option C", "option D"],
    "correct_index": 0
  }
]`

  try {
    const result  = await model.generateContent(prompt)
    const text    = result.response.text().trim()
    const match   = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')
    const questions = JSON.parse(match[0])
    if (!Array.isArray(questions) || questions.length < 3) throw new Error('Too few questions')
    return NextResponse.json({ questions: questions.slice(0, 5) })
  } catch (e) {
    console.error('generate-questions error:', e)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(e)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
