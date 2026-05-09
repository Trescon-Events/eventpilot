import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET /api/content/campaigns?event_id=xxx  — list campaigns for an event
// GET /api/content/campaigns               — list all campaigns (admin)
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')

  const query = supabaseAdmin
    .from('content_campaigns')
    .select(`
      id, name, objective, phase, status, platforms, posts_per_week,
      start_date, duration_weeks, brand_notes, created_at, updated_at,
      event_id,
      events(id, name, city, event_date),
      content_posts(count)
    `)
    .order('created_at', { ascending: false })

  if (eventId) query.eq('event_id', eventId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/content/campaigns — create campaign
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('content_campaigns')
    .insert({
      event_id:       body.event_id ?? null,
      name:           body.name,
      objective:      body.objective     ?? '',
      phase:          body.phase         ?? 'pre_event',
      status:         body.status        ?? 'planning',
      platforms:      body.platforms     ?? [],
      posts_per_week: body.posts_per_week ?? {},
      weeks:          body.weeks         ?? [],
      start_date:     body.start_date    ?? null,
      duration_weeks: body.duration_weeks ?? 4,
      brand_notes:    body.brand_notes   ?? '',
      created_by:     body.created_by    ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
