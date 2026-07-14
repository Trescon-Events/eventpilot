/*
  Market Intelligence access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces the actual tool_grants.intelligence
  check server-side, before any page HTML renders. Follows the same pattern
  as app/admin/bespoke/layout.tsx and app/smartexcel/layout.tsx.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function MarketIntelLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('market-intel')
  return <>{children}</>
}
