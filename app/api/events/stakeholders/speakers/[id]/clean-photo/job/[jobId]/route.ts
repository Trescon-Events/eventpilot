import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/speakers/[id]/clean-photo/job/[jobId]
   Status poll for the background 'ai_fill' job .../clean-photo/generate
   creates — see that route's top doc comment for why this exists (the
   Cloudflare proxy in front of production kills any single request around
   ~100s, so the AI Fill pipeline can no longer be awaited inline). Returns
   { status: 'processing' } while running, or once finished either
   { status: 'done', result: {...} } (the exact same shape
   .../clean-photo/generate used to resolve to inline — needs_confirmation,
   pending_photo_url, suggested_head_box, ai_extended, ai_edited_photo_url)
   or { status: 'error', error: string }. The wizard polls this every few
   seconds while phase === 'cleaning'.

   speakerId isn't used for anything beyond matching the URL shape of the
   rest of this module — the job row's own id is the only key that matters,
   and it's already scoped to one speaker at creation time. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { jobId } = await params

  const { data: job } = await supabaseAdmin
    .from('speaker_photo_clean_jobs')
    .select('status, result, error_message')
    .eq('id', jobId)
    .single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'processing') return NextResponse.json({ status: 'processing' })
  if (job.status === 'error') return NextResponse.json({ status: 'error', error: job.error_message || 'Could not clean this photo' })
  return NextResponse.json({ status: 'done', result: job.result })
}
