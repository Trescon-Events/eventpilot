import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/events/access/stale
   Eligibility gate + stale-access report (2026-09-11, Madhu): event-scoped
   access is meant to be held only by that event's actual Staff (the
   event_staff roster carried forward from Staff Portal). The eligibility
   gate in .../assignments/route.ts POST stops NEW grants from violating
   this; this endpoint finds EXISTING grants that already do — either
   because they predate the gate, or because the person has since rolled
   off the event's roster (a Staff Portal sync doesn't currently delete
   old event_staff rows when someone's allocation ends, so this can also
   under-report — see the code comment below).

   Deliberately read-only: flags for a human to review and act on via the
   existing revoke endpoint (DELETE .../assignments/[assignmentId]), never
   auto-revokes — an auto_granted row already gets cleanly replaced by the
   next sync if the underlying role_type mapping changes, but a manual
   grant is a human decision that only a human should undo. Platform
   admin only, matching every other route under app/api/events/access/. */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: assignments, error } = await supabaseAdmin
    .from('event_access_assignments')
    .select('id, event_id, staff_id, granted_at, auto_granted, staff_members!staff_id(name, email), access_roles_catalog!role_id(name), events!event_id(name)')
    .not('event_id', 'is', null)
    .order('granted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = assignments ?? []
  if (rows.length === 0) return NextResponse.json([])

  const eventIds = [...new Set(rows.map(r => r.event_id as string))]
  const { data: roster } = await supabaseAdmin.from('event_staff').select('event_id, staff_id').in('event_id', eventIds)
  const rosterKeys = new Set((roster ?? []).map(r => `${r.event_id}:${r.staff_id}`))

  const stale = rows.filter(r => !rosterKeys.has(`${r.event_id}:${r.staff_id}`))
  return NextResponse.json(stale)
}
