import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { getAccessibleEventIds } from '@/app/lib/access/event-access'
import { TRACKED_EVENT_FIELDS, logEventFieldChanges } from '@/app/lib/events/detail-field-log'

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
          public_name, public_dates_display, public_venue_display,
          event_format, country, website_url, event_hashtag, registration_url,
          social_linkedin, social_x, social_instagram, social_facebook, social_youtube,
          venue_map_url, postiz_profile_key, creative_template_config,
          event_staff(count),
          documents(count)
        `)
        .eq('id', id)
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 404 })
      return NextResponse.json(data)
    }

    if (staffId) {
      // getAccessibleEventIds already checks platform-admin status (and
      // org-wide RBAC grants) before falling back to a specific event_id
      // list — a platform admin/board member with no event_staff roster
      // row (e.g. Madhu) used to get an empty "My Events" here even though
      // every other admin-aware surface (the plain admin branch below,
      // /api/events/access/my-events) already showed them everything.
      const access = await getAccessibleEventIds(staffId)

      if (access.allEvents) {
        const { data, error } = await supabaseAdmin
          .from('events')
          .select(`
            id, name, type, status, event_date, end_date, venue, city, client_name, description, created_at,
            public_dates_display
          `)
          .order('created_at', { ascending: false })
        if (error) throw error
        return NextResponse.json((data ?? []).map(ev => ({ ...ev, my_role: null, has_workspace_access: true })))
      }

      // Events assigned to this staff member (roster, event_staff — the
      // older staffing table). Separately, event_access_assignments is the
      // real RBAC system (2026-08-16) and does NOT sync with event_staff by
      // design (see supabase/access_rbac.sql) — a roster row alone doesn't
      // grant workspace tool access, so has_workspace_access is a genuinely
      // separate check, not derived from the roster query above.
      const { data: assignments } = await supabaseAdmin
        .from('event_staff')
        .select('event_id, role, events(id, name, type, status, event_date, venue, city, client_name, description)')
        .eq('staff_id', staffId)
      const accessibleEventIds = new Set(access.eventIds)
      return NextResponse.json((assignments ?? []).map(a => ({
        ...a.events,
        my_role: a.role,
        has_workspace_access: accessibleEventIds.has(a.event_id),
      })))
    }

    // Admin — all events
    const { data, error } = await supabaseAdmin
      .from('events')
      .select(`
        id, name, type, status, event_date, end_date, venue, city, client_name, description, created_at,
        public_dates_display,
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

/* PATCH /api/events?id=uuid — update event
   Any of TRACKED_EVENT_FIELDS (the Common Details set — public_name,
   website_url, social_*, etc.) present in the body gets diffed against the
   current row and logged to event_details_field_changes as a 'manual'
   change — see app/lib/events/detail-field-log.ts. Every other field on
   this route's body (name, status, financials, ...) is untouched by this
   and just updates as before. */
export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  // Supabase can't infer column types from a dynamically-built select
  // string, hence the cast — the columns themselves are real (TRACKED_EVENT_FIELDS).
  const { data: before } = await supabaseAdmin.from('events').select(TRACKED_EVENT_FIELDS.join(', ')).eq('id', id).maybeSingle() as { data: Record<string, unknown> | null }

  const { data, error } = await supabaseAdmin.from('events').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before) {
    const session = getSession(req)
    await logEventFieldChanges(id, before, body, 'manual', session?.sid ?? null)
  }

  return NextResponse.json(data)
}

/* DELETE /api/events?id=uuid */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('events').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
