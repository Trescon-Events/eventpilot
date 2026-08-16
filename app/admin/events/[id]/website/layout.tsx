/*
  Website Builder access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces access server-side, before
  any page HTML renders.

  2026-08-16 (Phase 3): switched from the global tool_grants.website_builder
  flag (requireModuleAccess('website-builder')) to the per-event RBAC
  system — website-builder.view is an event-scoped permission, and this
  tool lives under /admin/events/[id]/..., so it belongs there. Same
  pattern as app/admin/events/[id]/creative-templates/admin/layout.tsx's
  2026-08-16 migration. The 4 staff who held the legacy tool_grants flag
  were backfilled a matching global (event_id NULL) role assignment
  ahead of this cutover — see supabase/access_rbac.sql's "ORG-WIDE
  (GLOBAL) ASSIGNMENTS" section for what that means.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function WebsiteBuilderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'website-builder.view'))
  if (!ok) redirect('/no-access?tool=website-builder')

  return <>{children}</>
}
