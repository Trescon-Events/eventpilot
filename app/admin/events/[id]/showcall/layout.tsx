/* Show Caller access gate: view (or manage) is enough to open the sheet; edits are checked again in the API. Same shape as the Agenda gate, without a feature toggle. */

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function ShowcallLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.showcall.view')) || (await hasEventPermission(session.sid, eventId, 'sae.showcall.manage'))
  if (!ok) redirect('/no-access?tool=showcall')

  return <>{children}</>
}
