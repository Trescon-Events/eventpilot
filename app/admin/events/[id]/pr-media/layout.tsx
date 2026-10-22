/*
  PR & Media workspace access gate. Middleware treats this as a "tool route" (authenticated-only); this layout enforces access server-side,
  before any page HTML renders — same pattern as operations/layout.tsx. An assigned PR contact gets in without holding pr.view.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import FeatureDisabled from '@/app/components/FeatureDisabled'
import { isPrContact } from '@/app/lib/pr/access'

export default async function PrMediaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'pr.view')) || (await isPrContact(session.sid, eventId))
  if (!ok) redirect('/no-access?tool=pr-media')

  if (!isPlatformAdmin && !(await isEventFeatureEnabled(eventId, 'pr-media'))) {
    return <FeatureDisabled label="PR & Media" eventId={eventId} />
  }

  return <>{children}</>
}
