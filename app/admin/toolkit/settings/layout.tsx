import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/*
  Access gate for the shared "Event Tools Access" settings page
  (app/admin/toolkit/settings/event-tools/page.tsx) — grants/revokes who can
  use Website Builder, Market Intelligence, and Brand Studio. Those 3 tools
  are event-scoped (/admin/events/[id]/website|market-intel|brand), but WHO
  can use them at all is a global, per-staff-member concern — so this page
  lives outside the event tree and isn't covered by any of those tools' own
  layout.tsx (which are event-scoped and wouldn't apply here anyway). Needs
  its own server-side check before the client page renders, same pattern as
  app/admin/toolkit/knowledge-base/layout.tsx.

  Kept deliberately permissive here: super admin OR module-admin tier on ANY
  ONE of the three tools is enough to see the page at all. AccessTab itself
  then restricts each individual tab's grant-management UI to only render
  for someone with admin tier on THAT specific tool (see
  app/components/AccessTab.tsx) — so a Website Builder admin who isn't a
  Brand Studio admin can reach this page but can't manage Brand Studio's grants.
*/
export default async function EventToolsSettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')

  if (!session.adm) {
    const [websiteAdmin, marketIntelAdmin, brandStudioAdmin] = await Promise.all([
      hasModuleAccess(session.sid, 'website-builder', 'admin'),
      hasModuleAccess(session.sid, 'market-intel', 'admin'),
      hasModuleAccess(session.sid, 'brand-studio', 'admin'),
    ])
    if (!websiteAdmin && !marketIntelAdmin && !brandStudioAdmin) {
      redirect('/no-access?tool=event_tools_settings')
    }
  }

  return <>{children}</>
}
