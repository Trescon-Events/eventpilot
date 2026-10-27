import { NextRequest, NextResponse } from 'next/server'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { CONSOLE_ALL_KEY, CONSOLE_TAB_KEY, type ConsoleTab } from '@/app/lib/access/admin-console'

/** Server side of the Admin Console areas: the whole-console key or the area's own key, or a platform admin. Returns the session, or a ready 401/403. */
export async function requireConsoleArea(req: NextRequest, eventId: string, tab: ConsoleTab): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, CONSOLE_ALL_KEY)) || (await hasEventPermission(session.sid, eventId, CONSOLE_TAB_KEY[tab]))
  return ok ? { session } : { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
}
