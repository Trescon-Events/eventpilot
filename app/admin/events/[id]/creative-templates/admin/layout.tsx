/*
  Admin Console gate — stricter than the parent creative-templates layout.
  That outer layout already confirmed the visitor has SOME 'sae' access;
  this one additionally requires admin-tier specifically, since this is
  where variants (layer stacks) get created/edited and access itself gets
  granted to other staff.

  Deliberately NOT routed through requireModuleAccess()/checkAccess()'s
  generic 'module_access' kind — that kind calls hasModuleAccess() directly
  with no platform-admin bypass (unlike 'admin_only', which checks
  session.adm first), so a platform admin with no explicit module_access
  row would get redirected to /no-access despite clearly being allowed.
  Confirmed via a real live test before landing on this fix. Checked here
  by hand instead: platform admin OR an explicit 'admin'-tier 'sae' grant.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasModuleAccess } from '@/app/lib/access/module-access'

export default async function CreativeTemplatesAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasModuleAccess(session.sid, 'sae', 'admin'))
  if (!ok) redirect('/no-access?tool=sae-admin')

  return <>{children}</>
}
