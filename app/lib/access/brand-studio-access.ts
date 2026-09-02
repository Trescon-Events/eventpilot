import { NextResponse } from 'next/server'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

/*
  Mirrors app/admin/events/[id]/brand/layout.tsx's own gate (platform admin
  OR the event-scoped 'brand-studio.view' RBAC permission) — for the
  app/api/events/brand/** routes, which the page layout doesn't cover since
  a direct API call bypasses it.
*/
export async function requireBrandStudioAccess(eventId: string): Promise<NextResponse | null> {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'brand-studio.view'))
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
