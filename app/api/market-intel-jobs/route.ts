import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireMarketIntelAccess } from '@/app/lib/access/market-intel-access'

// ── GET — list all jobs for an event ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const jobId   = req.nextUrl.searchParams.get('job_id')

  if (!eventId && !jobId) return NextResponse.json({ error: 'event_id or job_id required' }, { status: 400 })

  const denied = await requireMarketIntelAccess({ eventId, jobId })
  if (denied) return denied

  if (jobId) {
    // Single job detail: job + its scans + companies + speakers
    const { data: job, error: jErr } = await supabaseAdmin
      .from('market_intel_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 404 })

    const { data: scans } = await supabaseAdmin
      .from('market_intel_scans')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    const scanIds = (scans ?? []).map((s: { id: string }) => s.id)

    let companies: unknown[] = []
    let speakers: unknown[] = []

    if (scanIds.length > 0) {
      const { data: c } = await supabaseAdmin
        .from('market_intel_companies')
        .select('*')
        .in('scan_id', scanIds)
        .eq('is_duplicate', false)
        .order('confidence', { ascending: false })
      companies = c ?? []

      const { data: sp } = await supabaseAdmin
        .from('market_intel_speakers')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      speakers = sp ?? []
    }

    return NextResponse.json({ job, scans: scans ?? [], companies, speakers })
  }

  if (!eventId) return NextResponse.json({ error: 'event_id or job_id required' }, { status: 400 })

  const { data: jobs, error } = await supabaseAdmin
    .from('market_intel_jobs')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: jobs ?? [] })
}

// ── POST — create a new job record ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id || !body?.urls?.length) {
    return NextResponse.json({ error: 'event_id and urls required' }, { status: 400 })
  }

  const denied = await requireMarketIntelAccess({ eventId: body.event_id })
  if (denied) return denied

  const label = body.label ?? `Batch — ${body.urls.length} URL${body.urls.length !== 1 ? 's' : ''}`

  const { data, error } = await supabaseAdmin
    .from('market_intel_jobs')
    .insert({
      event_id:   body.event_id,
      label,
      status:     'running',
      total_urls: body.urls.length,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job_id: data.id, job: data })
}

// ── PATCH — update job status (pause / resume / cancel) ──────────────────────
export async function PATCH(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const denied = await requireMarketIntelAccess({ jobId })
  if (denied) return denied

  const body = await req.json().catch(() => null)
  if (!body?.status) return NextResponse.json({ error: 'status required' }, { status: 400 })

  const allowed = ['pending', 'running', 'paused', 'cancelled', 'complete', 'failed']
  if (!allowed.includes(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })

  const update: Record<string, unknown> = { status: body.status }
  if (body.status === 'complete' || body.status === 'cancelled' || body.status === 'failed') {
    update.completed_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin.from('market_intel_jobs').update(update).eq('id', jobId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
