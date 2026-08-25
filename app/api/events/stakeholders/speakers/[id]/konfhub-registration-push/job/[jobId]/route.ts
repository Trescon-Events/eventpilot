import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/speakers/[id]/konfhub-registration-push/job/[jobId]
   Status poll for the background job .../konfhub-registration-push
   creates — see that route's top doc comment for why this exists (the
   Cloudflare proxy in front of production kills any single request around
   ~100s, and the KonfHub Capture API call ran long enough from Railway's
   network path to trip it on a live test). Returns { status: 'processing' }
   while running, or once finished either { status: 'done', result: {...} }
   (konfhub_booking_id + konfhub_registration_synced_at — the same shape
   the route used to resolve to inline) or { status: 'error', error: string }.
   The Details page polls this every few seconds while a registration is
   in flight. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { jobId } = await params

  const { data: job } = await supabaseAdmin
    .from('speaker_konfhub_registration_jobs')
    .select('status, result, error_message')
    .eq('id', jobId)
    .single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'processing') return NextResponse.json({ status: 'processing' })
  if (job.status === 'error') return NextResponse.json({ status: 'error', error: job.error_message || 'Could not register on KonfHub' })
  return NextResponse.json({ status: 'done', result: job.result })
}
