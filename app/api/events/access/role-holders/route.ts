import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/app/lib/registry/access'
import { getStaffWithRole } from '@/app/lib/access/event-access'

/* GET /api/events/access/role-holders?event_id=uuid&role=slug — staff
   holding a given access-role (by its global, reusable slug) on this
   event, unioned with anyone holding it globally (see getStaffWithRole's
   own doc comment). Built for the speaker Details page's Producer picker
   (role=producer) — not admin-gated, same "any authenticated staffer can
   see who holds a role, never anyone's actual permission grants beyond
   that" reasoning as .../access/me. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const role = req.nextUrl.searchParams.get('role')
  if (!eventId || !role) return NextResponse.json({ error: 'event_id and role required' }, { status: 400 })

  const session = await getServerSession()
  if (!session) return NextResponse.json({ staff: [] })

  const staff = await getStaffWithRole(eventId, role)
  return NextResponse.json({ staff })
}
