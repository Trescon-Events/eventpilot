import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasAnyEventAccess } from '@/app/lib/access/event-access'
import { fetchAllStaffPortal } from '@/app/lib/staff-portal/client'
import { applyEventCore, applyUmbrellaCore } from '@/app/lib/staff-portal/event-core-sync'
import type { StaffPortalEvent, StaffPortalUmbrella, StaffPortalStaff } from '@/app/lib/staff-portal/types'

/* POST /api/events/staff-portal-refresh   Body: { event_id }
   The "Refresh from Staff Portal" button in the event workspace (2026-11-11). Re-reads THIS event's project (and its umbrella) from the Staff Portal and
   applies the same core fields the nightly sync does — name, client, status, type, project dates, umbrella link, coordinator, event days, and the two
   auto-filled public fields. Any producer with access to the event may press it; it touches only this event. Returns what changed, field by field. */

/** An umbrella is refreshed from the umbrella page, which is platform-admin only. */
async function refreshUmbrella(umbrellaId: string, isAdmin: boolean) {
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { data: um } = await supabaseAdmin.from('event_umbrellas').select('id, staff_portal_umbrella_id').eq('id', umbrellaId).maybeSingle()
  if (!um) return NextResponse.json({ error: 'Umbrella event not found.' }, { status: 404 })
  if (!um.staff_portal_umbrella_id) return NextResponse.json({ error: 'This umbrella is not linked to the Staff Portal, so there is nothing to refresh.' }, { status: 400 })
  try {
    const { rows } = await fetchAllStaffPortal<StaffPortalUmbrella & Record<string, unknown>>('umbrellas')
    const u = rows.find(r => r.id === um.staff_portal_umbrella_id)
    if (!u) return NextResponse.json({ error: 'This umbrella was not found in the Staff Portal.' }, { status: 404 })
    const r = await applyUmbrellaCore([u], { stamp: true })
    const { data: after } = await supabaseAdmin.from('event_umbrellas').select('sp_refreshed_at').eq('id', umbrellaId).maybeSingle()
    return NextResponse.json({ ok: true, refreshed_at: after?.sp_refreshed_at ?? new Date().toISOString(), changes: r.changes, notes: [...new Set(r.notes)] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Refresh failed.'
    return NextResponse.json({ error: /\b401\b/.test(msg) ? 'The Staff Portal did not accept the sync key. Ask Madhu to check it.' : `Could not refresh from the Staff Portal: ${msg}` }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const umbrellaId = typeof body?.umbrella_id === 'string' ? body.umbrella_id : ''
  if (umbrellaId) return refreshUmbrella(umbrellaId, !!session.adm)
  const eventId = typeof body?.event_id === 'string' ? body.event_id : ''
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasAnyEventAccess(session.sid, eventId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: ev } = await supabaseAdmin.from('events').select('id, hrms_project_id').eq('id', eventId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  if (!ev.hrms_project_id) return NextResponse.json({ error: 'This event is not linked to a Staff Portal project, so there is nothing to refresh.' }, { status: 400 })

  try {
    const [{ rows: projects }, { rows: umbrellas }, { rows: staff }] = await Promise.all([
      fetchAllStaffPortal<StaffPortalEvent & Record<string, unknown>>('events'),
      fetchAllStaffPortal<StaffPortalUmbrella & Record<string, unknown>>('umbrellas'),
      fetchAllStaffPortal<StaffPortalStaff>('staff'),
    ])
    const result = await applyEventCore(projects, umbrellas, staff, { onlyProjectId: ev.hrms_project_id as string })
    const { data: after } = await supabaseAdmin.from('events').select('sp_refreshed_at').eq('id', eventId).maybeSingle()
    return NextResponse.json({ ok: true, refreshed_at: after?.sp_refreshed_at ?? new Date().toISOString(), changes: result.changes, notes: [...new Set(result.notes)] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Refresh failed.'
    console.error('[staff-portal-refresh]', msg)
    return NextResponse.json({ error: /\b401\b/.test(msg) ? 'The Staff Portal did not accept the sync key. Ask Madhu to check it.' : `Could not refresh from the Staff Portal: ${msg}` }, { status: 502 })
  }
}
