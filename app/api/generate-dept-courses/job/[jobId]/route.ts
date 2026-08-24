import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/generate-dept-courses/job/[jobId]
   Status poll for the background job .../generate-dept-courses creates —
   see that route's top doc comment for why this exists (the Cloudflare
   proxy in front of production kills any single request around ~100s, so
   up to 3 sequential Gemini course generations can no longer be awaited
   inline). Returns { status: 'processing' } while running, or once
   finished either { status: 'done', courses, errors } (courses = the saved
   drafts, errors = any non-fatal per-course failures — same shape the route
   used to resolve to inline) or { status: 'error', error } for an uncaught
   failure of the whole job. CourseGeneratorSection.tsx polls this every few
   seconds while its dept-seed button shows "Generating…". */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  const { data: job } = await supabaseAdmin
    .from('dept_course_gen_jobs')
    .select('status, courses, errors, error_message')
    .eq('id', jobId)
    .single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'processing') return NextResponse.json({ status: 'processing' })
  if (job.status === 'error') return NextResponse.json({ status: 'error', error: job.error_message || 'Course generation failed' })
  return NextResponse.json({ status: 'done', courses: job.courses ?? [], errors: job.errors ?? undefined })
}
