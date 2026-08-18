import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { checkAccess, getServerSession } from '@/app/lib/registry/access'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { getAccessibleEventIds } from '@/app/lib/access/event-access'

/*
  GET /api/events/access/my-events — "which events can I see, and which
  tools do I have on each" — powers the persistent sidebar's Events section
  and (later) the Toolkit event picker's filtering. Not admin-gated; every
  authenticated staffer needs this to know their own accessible events, and
  it never reveals anyone else's grants.

  Response: { allEvents: boolean, events: { id, name, status, event_date,
  city, toolKeys: string[] }[] }. `toolKeys` is a list of registry keys
  (website-builder, admin-event-stakeholders, admin-event-workspace, ...)
  the caller resolves against app/lib/registry/modules.tsx client-side for
  icon/label/href — this route only decides WHICH, never how to render.
*/

// The event workspace hub + its "shared" sub-pages (plan/execution/
// brief/details) are gated at the [id]/layout.tsx level by
// hasAnyEventAccess — ANY role on the event, not one specific permission
// key — see app/lib/registry/modules.tsx's comment on admin-event-workspace
// for why that doesn't fit the event_permission ModuleAccess shape. An
// event only ever reaches this route's `events` array because
// getAccessibleEventIds() already found a real assignment row for it,
// which is exactly hasAnyEventAccess's own underlying query — so these
// keys are always real (not assumed) for every event actually returned.
const SHARED_EVENT_PAGE_KEYS = ['admin-event-workspace', 'admin-event-plan', 'admin-event-execution', 'admin-event-brief', 'admin-event-details']

export async function GET() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ allEvents: false, events: [] })

  const isPlatformAdmin = !!session.adm

  let eventIds: string[] | null = null // null = every event (admin, or an org-wide RBAC grant)
  if (!isPlatformAdmin) {
    const access = await getAccessibleEventIds(session.sid)
    if (!access.allEvents && access.eventIds.length === 0) return NextResponse.json({ allEvents: false, events: [] })
    eventIds = access.allEvents ? null : access.eventIds
  }

  let query = supabaseAdmin.from('events').select('id, name, status, event_date, city').order('event_date', { ascending: false })
  if (eventIds) query = query.in('id', eventIds)
  const { data: events } = await query
  if (!events || events.length === 0) return NextResponse.json({ allEvents: isPlatformAdmin || eventIds === null, events: [] })

  // Admin (or an org-wide grant) already passes every check below by
  // construction (checkAccess's own admin bypass) — skip the per-event,
  // per-tool round trips entirely rather than re-deriving the same true N
  // times over.
  const specificTools = getModuleRegistry().filter(
    m => m.sidebar?.section === 'events' && m.needsEvent && !SHARED_EVENT_PAGE_KEYS.includes(m.key)
  )
  const allToolKeys = [...SHARED_EVENT_PAGE_KEYS, ...specificTools.map(m => m.key)]

  const results = await Promise.all(events.map(async ev => {
    if (isPlatformAdmin || eventIds === null) {
      return { id: ev.id, name: ev.name, status: ev.status, event_date: ev.event_date, city: ev.city, toolKeys: allToolKeys }
    }
    const specific = await Promise.all(specificTools.map(async mod => ({
      key: mod.key, ok: await checkAccess(mod.access, session, { eventId: ev.id }),
    })))
    return {
      id: ev.id, name: ev.name, status: ev.status, event_date: ev.event_date, city: ev.city,
      toolKeys: [...SHARED_EVENT_PAGE_KEYS, ...specific.filter(r => r.ok).map(r => r.key)],
    }
  }))

  return NextResponse.json({ allEvents: isPlatformAdmin || eventIds === null, events: results })
}
