/*
  Agenda Builder access gate (2026-10-05). Previously the page itself had no
  server-side gate (only its API routes checked sae.agenda.manage), so anyone
  with the URL saw a broken page. Same pattern as press-releases/layout.tsx:
  permission first, then the per-event 'agenda-builder' feature toggle.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import FeatureDisabled from '@/app/components/FeatureDisabled'

export default async function AgendaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasEventPermission(session.sid, eventId, 'sae.agenda.manage'))
  if (!ok) redirect('/no-access?tool=agenda')

  if (!isPlatformAdmin && !(await isEventFeatureEnabled(eventId, 'agenda-builder'))) {
    return <FeatureDisabled label="Agenda Builder" eventId={eventId} />
  }

  return <>{children}</>
}
