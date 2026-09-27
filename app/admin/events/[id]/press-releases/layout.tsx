/*
  Press Release Studio access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces access server-side, before any
  page HTML renders — same pattern as market-intel/layout.tsx and
  website/layout.tsx.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import FeatureDisabled from '@/app/components/FeatureDisabled'

export default async function PressReleasesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'sae.content_studio.press_release.view'))
  if (!ok) redirect('/no-access?tool=press-releases')

  // Per-event feature toggle (2026-09-27) — see app/lib/registry/feature-flags.ts.
  if (!isPlatformAdmin && !(await isEventFeatureEnabled(eventId, 'press-releases'))) {
    return <FeatureDisabled label="Press Release Studio" eventId={eventId} />
  }

  return <>{children}</>
}
