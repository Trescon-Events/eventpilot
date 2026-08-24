import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/kb/ingest/job/[jobId]
   Status poll for the background ingest job POST /api/kb/ingest creates —
   see that route's top doc comment for why this exists (the Cloudflare
   proxy in front of production kills any single request around ~100s, and
   the extract → Gemini summary → gap-detection chain can run past that).
   Returns { status: 'processing' } while running, or once finished either
   { status: 'done', result: {...} } (the exact same shape
   /api/kb/ingest used to return inline) or { status: 'error', error: string }.
   The upload UI polls this every few seconds while ingesting is in flight. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  const { data: job } = await supabaseAdmin
    .from('kb_ingest_jobs')
    .select('status, result, error_message')
    .eq('id', jobId)
    .single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'processing') return NextResponse.json({ status: 'processing' })
  if (job.status === 'error') return NextResponse.json({ status: 'error', error: job.error_message || 'Something went wrong while processing this document.' })
  return NextResponse.json({ status: 'done', result: job.result })
}
