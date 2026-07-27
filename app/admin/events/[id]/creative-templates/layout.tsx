/*
  Stakeholder Announcement Engine access gate. Middleware treats this as a
  "tool route" (authenticated-only, see middleware.ts's isToolRoute); this
  layout enforces the actual access rule server-side before any page HTML
  renders — platform admin, or a granted 'sae' module_access tier (user or
  admin, either is enough to reach the module at all). The nested /admin
  console route has its own additional layout requiring admin-tier
  specifically. Follows the same pattern as the sibling website/brand/
  market-intel layouts.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function CreativeTemplatesLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('admin-event-creative-templates')
  return <>{children}</>
}
