import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

/* POST /api/hr/recruitment/screen
   Body: { application_id, send_email?: boolean }
   - Reads candidate resume_text + requisition description
   - Calls Gemini to score and summarise
   - Updates application with ai_score, ai_summary, ai_recommendation
   - If shortlisted + send_email=true → logs email in candidate_emails */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.application_id) {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  }

  // Fetch application with candidate and requisition
  const { data: app, error: appErr } = await supabaseAdmin
    .from('candidate_applications')
    .select(`
      id, stage,
      candidate:candidate_id(full_name, email, resume_text),
      requisition:requisition_id(title, department, description, requirements)
    `)
    .eq('id', body.application_id)
    .single()

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const candidate   = app.candidate   as unknown as { full_name: string; email: string; resume_text: string | null }
  const requisition = app.requisition as unknown as { title: string; department: string; description: string | null; requirements: string | null }

  if (!candidate.resume_text) {
    return NextResponse.json({ error: 'No resume text available — upload resume first' }, { status: 400 })
  }

  // ── Gemini analysis ──────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are an expert HR recruiter screening a candidate for a role.

ROLE: ${requisition.title} (${requisition.department ?? 'N/A'})
${requisition.description ? `DESCRIPTION:\n${requisition.description}` : ''}
${requisition.requirements ? `REQUIREMENTS:\n${requisition.requirements}` : ''}

CANDIDATE RESUME:
${candidate.resume_text}

Evaluate this candidate and respond ONLY with valid JSON (no markdown):
{
  "score": <integer 0-100>,
  "strengths": [<up to 4 key strengths as short strings>],
  "gaps": [<up to 3 gaps or concerns as short strings>],
  "recommendation": "<shortlist | hold | reject>",
  "summary": "<2-3 sentence summary of fit>"
}`

  let aiResult: { score: number; strengths: string[]; gaps: string[]; recommendation: string; summary: string }
  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    const json   = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    aiResult     = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'AI analysis failed — check GEMINI_API_KEY and try again' }, { status: 500 })
  }

  const newStage = aiResult.recommendation === 'shortlist'
    ? 'shortlisted'
    : aiResult.recommendation === 'reject'
    ? 'rejected'
    : 'ai_screening'

  // ── Update application ───────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('candidate_applications')
    .update({
      stage:              newStage,
      stage_updated_at:   new Date().toISOString(),
      ai_score:           aiResult.score,
      ai_summary:         aiResult.summary,
      ai_strengths:       aiResult.strengths,
      ai_gaps:            aiResult.gaps,
      ai_recommendation:  aiResult.recommendation,
    })
    .eq('id', body.application_id)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // ── Send shortlist email (logged, not actually sent via SMTP yet) ────────
  let emailSent = false
  if (aiResult.recommendation === 'shortlist' && body.send_email !== false) {
    const subject = `Interview Invitation — ${requisition.title} at Trescon`
    const emailBody = `Dear ${candidate.full_name},

Thank you for your interest in the ${requisition.title} position at Trescon.

We have reviewed your application and are pleased to invite you for an interview. Our team will be in touch shortly to schedule a convenient time.

We look forward to speaking with you.

Best regards,
Trescon HR Team`

    await supabaseAdmin.from('candidate_emails').insert({
      application_id: body.application_id,
      template:       'shortlist_invite',
      subject,
      body:           emailBody,
    })
    emailSent = true
  }

  return NextResponse.json({
    application_id:   body.application_id,
    ai_score:         aiResult.score,
    ai_recommendation: aiResult.recommendation,
    ai_summary:       aiResult.summary,
    ai_strengths:     aiResult.strengths,
    ai_gaps:          aiResult.gaps,
    new_stage:        newStage,
    email_sent:       emailSent,
    application:      updated,
  })
}
