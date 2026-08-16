/*
  Brand Studio access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces access server-side, before
  any page HTML renders.

  2026-08-16 (Phase 3): switched from the global tool_grants.brand_studio
  flag (requireModuleAccess('brand-studio')) to the per-event RBAC system
  — see app/admin/events/[id]/website/layout.tsx's identical migration
  comment for the full reasoning; the same 4 staff were backfilled here too.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function BrandStudioLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'brand-studio.view'))
  if (!ok) redirect('/no-access?tool=brand-studio')

  return <>{children}</>
}
