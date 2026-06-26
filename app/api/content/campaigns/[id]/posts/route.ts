import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET /api/content/campaigns/:id/posts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('content_posts')
    .select('*')
    .eq('campaign_id', id)
    .order('scheduled_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/content/campaigns/:id/posts — bulk insert posts (on campaign creation)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body?.posts)) return NextResponse.json({ error: 'posts array required' }, { status: 400 })

  const rows = body.posts.map((p: Record<string, unknown>) => ({
    campaign_id:    id,
    week_number:    p.week_number    ?? 1,
    narrative_role: p.narrative_role ?? 'Awareness',
    platform:       p.platform,
    scheduled_date: p.scheduled_date,
    scheduled_time: p.scheduled_time ?? '09:00',
    status:         'planned',
    text:           '',
    image_url:      '',
  }))

  const { data, error } = await supabaseAdmin.from('content_posts').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/content/campaigns/:id/posts — bulk reschedule posts
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body?.updates)) return NextResponse.json({ error: 'updates array required' }, { status: 400 })

  const results = []
  for (const update of body.updates) {
    if (!update.id) continue
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (update.scheduled_date) patch.scheduled_date = update.scheduled_date
    if (update.scheduled_time) patch.scheduled_time = update.scheduled_time

    const { data, error } = await supabaseAdmin
      .from('content_posts')
      .update(patch)
      .eq('id', update.id)
      .eq('campaign_id', id)
      .select()
      .single()

    if (!error && data) results.push(data)
  }

  return NextResponse.json({ updated: results.length, results })
}
