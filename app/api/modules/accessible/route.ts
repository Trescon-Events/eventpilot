import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getAccessibleModuleKeys } from '@/app/lib/registry/access'

/*
  GET /api/modules/accessible?surface=platformMenu|toolkitHub
  Returns { keys: string[] } — the module registry keys the current session
  can see for that surface. Client components (PlatformMenu, Toolkit hub)
  import app/lib/registry/modules.tsx directly for the tile data (icons,
  labels, hrefs) and filter it locally against this list, rather than the
  server sending React nodes over JSON.
*/
export async function GET(req: NextRequest) {
  const session = getSession(req)
  const surfaceParam = req.nextUrl.searchParams.get('surface')
  const surface = surfaceParam === 'platformMenu' || surfaceParam === 'toolkitHub' ? surfaceParam : undefined

  const keys = await getAccessibleModuleKeys(session, surface)
  return NextResponse.json({ keys })
}
