/*
  Market Intelligence access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces access server-side, before
  any page HTML renders.

  2026-08-16 (Phase 3): switched from the global tool_grants.intelligence
  flag (requireModuleAccess('market-intel')) to the per-event RBAC system
  — see app/admin/events/[id]/website/layout.tsx's identical migration
  comment. No backfill needed here: zero staff held tool_grants.intelligence
  at cutover time (confirmed live before this change).
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function MarketIntelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'market-intel.view'))
  if (!ok) redirect('/no-access?tool=market-intel')

  return <>{children}</>
}
