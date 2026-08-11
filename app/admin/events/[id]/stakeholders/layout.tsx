/*
  Stakeholder Hub gate — first real consumer of the per-event Access/RBAC
  system (supabase/access_rbac.sql). Added to middleware.ts's isToolRoute
  regex so requests reach this layout instead of being redirected by the
  blanket "/admin/* requires session.adm" rule.

  Deliberately NOT routed through requireModuleAccess()/checkAccess()'s
  generic 'module_access' kind — same reasoning as
  creative-templates/admin/layout.tsx: that kind has no platform-admin
  bypass, so an admin with no explicit event_access_assignments row would
  get wrongly redirected. Checked here by hand: platform admin OR an
  explicit 'sae.stakeholders.view' grant for THIS event.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function StakeholderHubLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params
  const session = await getServerSession()
  if (!session) redirect('/login')

  const ok = !!session.adm || await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view')
  if (!ok) redirect('/no-access?tool=sae-stakeholders')

  return <>{children}</>
}
