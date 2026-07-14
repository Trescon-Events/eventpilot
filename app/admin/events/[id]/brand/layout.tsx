/*
  Brand Studio access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces the actual tool_grants.brand_studio
  check server-side, before any page HTML renders. Follows the same pattern
  as app/admin/bespoke/layout.tsx and app/smartexcel/layout.tsx.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function BrandStudioLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('brand-studio')
  return <>{children}</>
}
