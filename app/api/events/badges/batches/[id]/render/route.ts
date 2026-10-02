import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadBatch, requireBadgePermission, runRenderJob, startJob, sweepDeadJobs } from '@/app/lib/badges/service'

/* POST .../batches/[id]/render { all?: true } -> { job_id }
   Starts the background render of every badge without a fresh preview (all:true re-renders everything). Not awaited —
   see app/lib/badges/service.ts for why. Poll /api/events/badges/jobs/[jobId]. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  if (batch.status === 'approved') return NextResponse.json({ error: 'The batch is approved. Reopen it to make changes.' }, { status: 409 })

  await sweepDeadJobs(id)
  const { data: running } = await supabaseAdmin.from('badge_jobs').select('id').eq('batch_id', id).eq('kind', 'render').eq('status', 'processing').limit(1)
  if (running?.length) return NextResponse.json({ job_id: running[0].id, already_running: true })

  const body = await req.json().catch(() => null) as { all?: boolean } | null
  if (body?.all) await supabaseAdmin.from('badge_batch_items').update({ preview_stale: true }).eq('batch_id', id)
  const { count } = await supabaseAdmin.from('badge_batch_items').select('id', { count: 'exact', head: true }).eq('batch_id', id).eq('removed', false).eq('preview_stale', true)
  const jobId = await startJob(id, 'render', count ?? 0, auth.session.sid)
  void runRenderJob(jobId, id)
  return NextResponse.json({ job_id: jobId })
}
