import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { presignGet } from '@/app/lib/kb/storage'
import { loadBatch, requireBadgePermission, runPdfJob, startJob, sweepDeadJobs } from '@/app/lib/badges/service'

/* POST .../batches/[id]/pdf -> { job_id }  builds the real print PDF from the approved badges (batch must be approved)
   GET  .../batches/[id]/pdf?version=N -> { url, filename }  short-lived presigned link to a stored version
   Both need sae.badges.approve: whoever releases badges to the vendor. The file lives in private R2. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.approve')
  if ('error' in auth) return auth.error
  if (batch.status !== 'approved') return NextResponse.json({ error: 'Approve the batch for print first.' }, { status: 409 })

  await sweepDeadJobs(id)
  const { data: running } = await supabaseAdmin.from('badge_jobs').select('id').eq('batch_id', id).eq('kind', 'pdf').eq('status', 'processing').limit(1)
  if (running?.length) return NextResponse.json({ job_id: running[0].id, already_running: true })

  const { count } = await supabaseAdmin.from('badge_batch_items').select('id', { count: 'exact', head: true }).eq('batch_id', id).eq('removed', false).eq('approved', true)
  const jobId = await startJob(id, 'pdf', count ?? 0, auth.session.sid)
  void runPdfJob(jobId, id, auth.session.sid)
  return NextResponse.json({ job_id: jobId })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.approve')
  if ('error' in auth) return auth.error
  const versions = batch.pdf_versions ?? []
  const index = req.nextUrl.searchParams.get('version') ? Number(req.nextUrl.searchParams.get('version')) : versions.length
  const v = versions[index - 1]
  if (!v) return NextResponse.json({ error: 'No print file has been generated yet.' }, { status: 404 })
  const safe = batch.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'badges'
  return NextResponse.json({ url: await presignGet(v.key), filename: `${safe}-print-v${index}.pdf` })
}
