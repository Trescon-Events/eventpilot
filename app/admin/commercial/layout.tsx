/*
  Commercial P&L access gate.

  Previously this route had NO real access enforcement of its own — no
  layout.tsx existed, so middleware's generic /admin/* rule applied
  (admin-only), and the registry's toolkitHub tool_grant only ever
  controlled Toolkit-hub tile visibility, not actual entry. This layout
  enforces the real rule server-side via the module registry, same pattern
  as every other tool_grant-gated module (see app/admin/bespoke/layout.tsx):

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.commercial === true → allowed
    - Staff with an admin/user-tier module_access row for 'commercial' → allowed
    - Everyone else → redirected to /no-access before any page HTML renders

  middleware.ts's isToolRoute must include /admin/commercial for this to be
  reached at all — otherwise the generic /admin/* admin-only block still
  wins first.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function CommercialLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('commercial')
  return <>{children}</>
}
