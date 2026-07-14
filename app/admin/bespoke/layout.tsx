/*
  Bespoke Tracker access gate.

  Middleware lets any authenticated user reach /admin/bespoke/* (treated as a
  "tool route", same pattern as /admin/toolkit). This layout enforces the
  actual access rule server-side via the module registry:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.bespoke === true → allowed
    - Everyone else → redirected to /no-access before any page HTML renders

  Replaces a previous client-side-only version of this same gate — a
  client check only hides the page after hydration, it doesn't stop the
  underlying API routes from being called directly. This redirects at the
  server before anything is sent. Do not remove.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function BespokeLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('bespoke-tracker')
  return <>{children}</>
}
