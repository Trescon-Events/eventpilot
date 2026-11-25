import { NextResponse } from 'next/server'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same access rule as title cards / thumbnails: admin, sae.videos.manage or sae.admin.access on the event. */
export async function requireLowerThirdAccess(eventId: string) {
  const session = await getServerSession()
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.videos.manage')) || (await hasEventPermission(session.sid, eventId, 'sae.admin.access'))
  if (!ok) return { error: NextResponse.json({ error: 'No access.' }, { status: 403 }) }
  return { session }
}
