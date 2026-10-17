import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'
import UmbrellaReferenceDocs from '../UmbrellaReferenceDocs'

/* Umbrella Reference Documents — platform admin, or a role granted on this umbrella's Access page that includes sae.messaging.umbrella_manage.
   Every write underneath re-checks the same permission on the server. */
export default async function UmbrellaReferenceDocsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id } = await params
  if (!session.adm && !(await hasEventPermission(session.sid, id, 'sae.messaging.umbrella_manage'))) redirect('/no-access?tool=admin')
  return <UmbrellaReferenceDocs params={params} />
}
