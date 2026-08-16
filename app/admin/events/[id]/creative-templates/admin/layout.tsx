/*
  Admin Console gate — stricter than the parent creative-templates layout.
  That outer layout already confirmed the visitor has SOME 'sae' access;
  this one additionally requires the sae.admin.access permission
  specifically, since this is where variants (layer stacks) get
  created/edited and access itself gets granted to other staff.

  2026-08-16: unified onto the per-event access_role_permissions system
  (hasEventPermission) instead of the older, global 2-tier module_access
  table's 'admin' tier — see access-permissions.ts's sae.admin.access
  entry for why. Needs eventId from the URL (this system is per-event,
  module_access wasn't), read directly via params since layouts get the
  same params their page does.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function CreativeTemplatesAdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'sae.admin.access'))
  if (!ok) redirect('/no-access?tool=sae-admin')

  return <>{children}</>
}
