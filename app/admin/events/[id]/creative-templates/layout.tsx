/*
  Gate for everything still nested under /creative-templates — the retired
  workspace redirect itself, plus Queue and Admin Console (Admin Console
  layers its own additional sae.admin.access check on top). Platform admin,
  OR an explicit 'sae.stakeholders.view' grant for this event — same rule
  the Stakeholder Hub's own layout uses, since these are now reached only
  from inside the Hub and shouldn't be visible to anyone who can't see the
  Hub itself.

  2026-08-18 (SAE-into-Hub merge, commit 6): replaced a dead branch here —
  `checkAccess(mod.access, session)` was called with no `eventId` in its
  ctx, so its 'event_permission' case's `if (!ctx?.eventId) return false`
  always fired and that check always evaluated false. The comment above it
  claimed it covered a "legacy module_access tier" grant, but it never
  actually did; the real gate was always just hasAnyModulePermission(...,
  'sae') below it. Also narrowed from "any sae.* permission" to
  'sae.stakeholders.view' specifically, per the same reasoning as above —
  verified against production first (see commit message) that every
  current sae.* grant already includes this key, so nobody loses access.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function CreativeTemplatesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const ok = !!session.adm || await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view')
  if (!ok) redirect('/no-access?tool=sae')

  return <>{children}</>
}
