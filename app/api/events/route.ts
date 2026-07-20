import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events — list all events with staff count and doc count */
export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get('staff_id')
  const id      = req.nextUrl.searchParams.get('id')

  try {
    // Single event fetch by ID (for workspace page)
    if (id) {
      const { data, error } = await supabaseAdmin
        .from('events')
        .select(`
          id, name, type, status, event_date, end_date, venue, city, client_name,
          description, expected_attendance, created_at,
          event_format, country, website_url, event_hashtag, registration_url,
          social_linkedin, social_x, social_instagram, social_facebook, social_youtube,
          venue_map_link, venue_map_place_id, ayrshare_profile_key, canva_template_config,
          event_staff(count),
          documents(count)
        `)
        .eq('id', id)
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 404 })
      return NextResponse.json(data)
    }

    if (staffId) {
      // Events assigned to this staff member
      const { data: assignments } = await supabaseAdmin
        .from('event_staff')
        .select('event_id, role, events(id, name, type, status, event_date, venue, city, client_name, description)')
        .eq('staff_id', staffId)
      return NextResponse.json((assignments ?? []).map(a => ({ ...a.events, my_role: a.role })))
    }

    // Admin — all events
    const { data, error } = await supabaseAdmin
      .from('events')
      .select(`
        id, name, type, status, event_date, end_date, venue, city, client_name, description, created_at,
        event_staff(count),
        documents(count),
        event_checklist(count)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('events GET error:', e)
    return NextResponse.json([], { status: 500 })
  }
}

/* POST /api/events — create event */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('events')
    .insert({
      name:        body.name,
      type:        body.type        || 'conference',
      status:      body.status      || 'planning',
      event_date:  body.event_date  || null,
      end_date:    body.end_date    || null,
      venue:       body.venue       || null,
      city:        body.city        || null,
      client_name: body.client_name || null,
      description: body.description || null,
      created_by:  body.created_by  || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Auto-seed checklist from master template ──────────────────────────────
  // Fetch all active templates and instantiate them for this event immediately.
  // If templates haven't been seeded yet (SQL not run), this silently skips.
  try {
    const { data: templates } = await supabaseAdmin
      .from('event_task_templates')
      .select('department, workstream, title, depends_on, priority, sort_order')
      .eq('is_active', true)
      .order('department')
      .order('sort_order')

    if (templates && templates.length > 0) {
      const rows = templates.map(t => ({
        event_id:   data.id,
        department: t.department,
        workstream: t.workstream,
        title:      t.title,
        depends_on: t.depends_on,
        priority:   t.priority,
        sort_order: t.sort_order,
        status:     'not_started',
      }))
      await supabaseAdmin.from('event_checklist').insert(rows)
    }
  } catch {
    // Template seeding is best-effort — don't fail event creation
  }

  return NextResponse.json(data)
}

/* PATCH /api/events?id=uuid — update event */
export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('events').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* DELETE /api/events?id=uuid */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('events').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
