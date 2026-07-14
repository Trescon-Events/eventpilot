/*
  Website Builder access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces the actual tool_grants.website_builder
  check server-side, before any page HTML renders. Follows the same pattern
  as app/admin/bespoke/layout.tsx and app/smartexcel/layout.tsx.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function WebsiteBuilderLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('website-builder')
  return <>{children}</>
}
