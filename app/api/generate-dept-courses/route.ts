import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/generate-dept-courses
   Body: { department, tier_level?, count? }

   BACKGROUND-JOB-BACKED (2026-08-24). This runs up to 3 sequential full
   Gemini course generations (each producing 500+ words of read_content plus
   a 10-question bank) — previously awaited inline, which worked every time
   in local dev but risks exceeding the ~100s timeout the Cloudflare Worker
   proxy in front of production Railway enforces on any single request (see
   app/api/events/stakeholders/speakers/[id]/clean-photo/generate/route.ts's
   doc comment for the real incident that surfaced this failure class, and
   app/api/kb/intel/run/route.ts for the original application of this fix).
   `maxDuration = 120` below is a Next.js route-segment config that does
   nothing against Cloudflare's own independent proxy timeout — it was never
   sufficient on its own.

   Creates a dept_course_gen_jobs row and fires the generation loop off as a
   background async function without awaiting it (safe — EventPilot runs on
   Railway as a persistent `next start` process, not a serverless function
   torn down after the response), returning { job_id } immediately. The
   admin UI (CourseGeneratorSection.tsx) polls
   GET .../generate-dept-courses/job/[jobId] every few seconds until the job
   leaves 'processing'. No incremental per-course progress is written mid-run
   — the loop is capped at 3 items, small enough that a single done/error
   result at the end (unlike kb_intel_runs' known per-source-progress gap
   over a much longer run) is not worth the extra write complexity. */
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

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('dept_course_gen_jobs')
    .insert({ status: 'processing', department, tier_level, count: Math.min(count, 3) })
    .select('id')
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Could not start the course generation job' }, { status: 500 })

  // Fire and forget — see this file's top doc comment for why this is safe
  // here (persistent Railway process, not serverless).
  runGenerateJob(job.id, department, tier_level, count).catch(async e => {
    console.error(`[generate-dept-courses job ${job.id}] uncaught error:`, e)
    await supabaseAdmin.from('dept_course_gen_jobs').update({
      status: 'error',
      completed_at: new Date().toISOString(),
      error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
    }).eq('id', job.id)
  })

  return NextResponse.json({ job_id: job.id })
}

// The actual generation loop, run detached from the request/response cycle
// (see this file's top doc comment). Identical generation logic to the
// route's previous synchronous version — only where the result lands has
// changed (dept_course_gen_jobs instead of the HTTP response body).
async function runGenerateJob(jobId: string, department: string, tier_level: string, count: number) {
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

  await supabaseAdmin.from('dept_course_gen_jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
    courses: generated,
    errors: errors.length > 0 ? errors : null,
  }).eq('id', jobId)
}
