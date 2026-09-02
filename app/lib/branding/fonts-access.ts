import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasPlatformPermission } from '@/app/lib/access/event-access'

/*
  Mirrors app/admin/branding/fonts/layout.tsx's own gate exactly (platform
  admin OR the delegated 'platform.branding.manage' RBAC permission) — the
  registry's 'branding-fonts' entry is admin_only with no grantKey, which is
  narrower than what the page itself actually allows, so the generic
  requireApiModuleAccess() helper isn't the right fit here. Font LIST reads
  stay open (consumed well beyond the Font Library page itself, e.g. the SAE
  creative-templates editor's font dropdown) — only mutations are gated.
*/
export async function requireFontLibraryWriteAccess(req: NextRequest): Promise<NextResponse | null> {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const ok = !!session.adm || (await hasPlatformPermission(session.sid, 'platform.branding.manage'))
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return null
}
