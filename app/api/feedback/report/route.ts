import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

/*
  GET /api/feedback/report
  Fetches all platform feedback and asks Gemini to compile a structured analysis:
  - Key themes
  - Most requested features
  - Sentiment overview
  - Recommended build priorities
*/

export async function GET() {
  const { data: feedback, error } = await supabaseAdmin
    .from('platform_feedback')
    .select('name, department, message, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!feedback?.length) return NextResponse.json({ error: 'No feedback to analyse yet.' }, { status: 400 })

  const feedbackText = feedback.map((f, i) =>
    `${i + 1}. ${f.name}${f.department ? ` (${f.department})` : ''}: "${f.message}"`
  ).join('\n')

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are analysing platform feedback submitted by staff at Trescon about Event Pilot — their internal AI learning platform.

Here is all the feedback received (${feedback.length} submissions):

${feedbackText}

Analyse this feedback and return a structured JSON report. Return ONLY valid JSON, no other text:

{
  "summary": "<2-3 sentence executive summary of what staff want and the overall sentiment>",
  "total_submissions": ${feedback.length},
  "top_themes": [
    { "theme": "<theme name>", "count": <number of submissions mentioning this>, "description": "<what staff are asking for>" }
  ],
  "top_requests": [
    { "feature": "<specific feature or improvement requested>", "priority": "high|medium|low", "departments": ["<dept>"], "rationale": "<why this matters>" }
  ],
  "sentiment": {
    "positive": <percentage 0-100>,
    "constructive": <percentage 0-100>,
    "critical": <percentage 0-100>,
    "overview": "<one sentence on overall sentiment>"
  },
  "recommended_build_order": [
    { "rank": 1, "item": "<what to build first>", "reason": "<why this has highest impact>" },
    { "rank": 2, "item": "<what to build second>", "reason": "<reason>" },
    { "rank": 3, "item": "<what to build third>", "reason": "<reason>" }
  ],
  "departments_most_engaged": ["<dept>"],
  "generated_at": "${new Date().toISOString()}"
}`

  try {
    const result = await model.generateContent(prompt)
    const raw    = result.response.text().trim()
    const match  = raw.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'Could not parse report from AI.' }, { status: 500 })
    const report = JSON.parse(match[0])
    return NextResponse.json({ report })
  } catch (err) {
    console.error('Feedback report error:', err)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(err)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'AI analysis failed. Try again.' }, { status: 500 })
  }
}
