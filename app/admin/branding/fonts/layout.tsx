/*
  Font Library access gate (2026-08-16) — previously this route had no
  layout at all and relied entirely on middleware.ts's blanket "/admin/*
  requires session.adm" rule, meaning it was platform-admin-only with no
  delegation path whatsoever (unlike HR/Finance/KB/DocuHub, which all have
  a sub-admin tier). Now delegatable via platform.branding.manage — see
  that key's own comment in app/lib/registry/access-permissions.ts for why
  it uses hasPlatformPermission() rather than hasEventPermission() (this
  tool genuinely has no event context). Requires this route to be added to
  middleware.ts's isToolRoute exceptions (done) so it can reach this gate
  instead of the blanket admin check.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasPlatformPermission } from '@/app/lib/access/event-access'

export default async function BrandingFontsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasPlatformPermission(session.sid, 'platform.branding.manage'))
  if (!ok) redirect('/no-access?tool=branding-fonts')

  return <>{children}</>
}
