/*
  Operations workspace access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces access server-side, before any
  page HTML renders — same pattern as market-intel/layout.tsx.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import FeatureDisabled from '@/app/components/FeatureDisabled'

export default async function OperationsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'ops.view'))
  if (!ok) redirect('/no-access?tool=operations')

  // Per-event feature toggle (2026-09-27) — see app/lib/registry/feature-flags.ts.
  if (!isPlatformAdmin && !(await isEventFeatureEnabled(eventId, 'operations'))) {
    return <FeatureDisabled label="Operations" eventId={eventId} />
  }

  return <>{children}</>
}
