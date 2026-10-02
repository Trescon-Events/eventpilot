import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireBadgePermission, sweepDeadJobs } from '@/app/lib/badges/service'

/* GET /api/events/badges/jobs/[jobId] -> { status, progress_done, progress_total, error?, result? }
   Unlike the older job polls this one checks permission, and flips a job nobody has touched for ~3 minutes to 'error'. */

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const { data: job } = await supabaseAdmin.from('badge_jobs').select('*, badge_batches(event_id)').eq('id', jobId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  const eventId = (job.badge_batches as { event_id: string } | null)?.event_id
  if (!eventId) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, eventId, 'sae.badges.view')
  if ('error' in auth) return auth.error
  await sweepDeadJobs(job.batch_id as string)
  const { data: fresh } = await supabaseAdmin.from('badge_jobs').select('*').eq('id', jobId).single()
  const j = fresh ?? job
  return NextResponse.json({ status: j.status, kind: j.kind, progress_done: j.progress_done, progress_total: j.progress_total, error: j.error_message ?? undefined, result: j.result ?? undefined })
}
