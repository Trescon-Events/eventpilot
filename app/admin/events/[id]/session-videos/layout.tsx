/* Session Videos access gate: sae.videos.manage (producers). The API checks it again on every call. */

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export default async function SessionVideosLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.videos.manage'))
  if (!ok) redirect('/no-access?tool=session-videos')

  return <>{children}</>
}
