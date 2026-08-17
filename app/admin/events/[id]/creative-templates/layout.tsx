/*
  Stakeholder Announcement Engine access gate. Middleware treats this as a
  "tool route" (authenticated-only, see middleware.ts's isToolRoute); this
  layout enforces the actual access rule server-side before any page HTML
  renders — platform admin, a granted 'sae' module_access tier (the
  legacy global grant), OR any 'sae.*' permission from the per-event RBAC
  system. The nested /admin console route has its own additional layout
  requiring sae.admin.access specifically.

  2026-08-17: added the RBAC branch. This was the one module in the
  2026-08-16 rollout (see sibling website/brand/market-intel layouts) left
  checking only the legacy system — real per-event RBAC grants (e.g. the
  Producer/Branding/Marketing Manager roles, which all hold sae.* keys)
  were invisible to it, so anyone granted access only through the new
  Access & Permissions UI hit "Request Access" here even though they had
  real, resolved permissions. Additive: the legacy checkAccess() branch is
  left in place so nobody who only holds the old grant loses access.
*/

import { redirect } from 'next/navigation'
import { checkAccess, getServerSession } from '@/app/lib/registry/access'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { hasAnyModulePermission } from '@/app/lib/access/event-access'

export default async function CreativeTemplatesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const mod = getModuleRegistry().find(m => m.key === 'admin-event-creative-templates')!
  const legacyOk = await checkAccess(mod.access, session)
  const rbacOk = legacyOk || (await hasAnyModulePermission(session.sid, eventId, 'sae'))
  if (!rbacOk) redirect('/no-access?tool=sae')

  return <>{children}</>
}
