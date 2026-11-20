import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasAnyModulePermission } from '@/app/lib/access/event-access'

export default async function SessionVideosLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const ok = !!session.adm || (await hasAnyModulePermission(session.sid, eventId, 'sae'))
  if (!ok) redirect('/no-access?tool=session-videos')

  return <>{children}</>
}
