import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getAccessibleModuleKeys } from '@/app/lib/registry/access'

/*
  GET /api/modules/accessible?surface=platformMenu|toolkitHub|sidebar
  Returns { keys: string[] } — the module registry keys the current session
  can see for that surface. Client components (PlatformMenu, Toolkit hub,
  the persistent sidebar's Home/Pilots/Admin/Toolkit sections) import
  app/lib/registry/modules.tsx directly for the tile data (icons, labels,
  hrefs, sidebar.section/parent/order) and filter/group it locally against
  this list, rather than the server sending React nodes over JSON.

  'sidebar' returns a flat list spanning every sidebar-tagged section (home/
  events/pilots/admin/toolkit mixed together) — the sidebar component groups
  by each key's own m.sidebar.section after resolving, same "server decides
  access, client renders" split as every other surface here. The Events
  section's own per-user event list is separate — see
  GET /api/events/access/my-events, which needs an eventId per check and so
  can't share this key-only shape.
*/
export async function GET(req: NextRequest) {
  const session = getSession(req)
  const surfaceParam = req.nextUrl.searchParams.get('surface')
  const surface = surfaceParam === 'platformMenu' || surfaceParam === 'toolkitHub' || surfaceParam === 'sidebar' ? surfaceParam : undefined

  const keys = await getAccessibleModuleKeys(session, surface)
  return NextResponse.json({ keys })
}
