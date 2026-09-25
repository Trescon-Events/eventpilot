/*
  Umbrella Operations access gate. Middleware treats this as a "tool route"
  (authenticated-only); this layout enforces access server-side. An umbrella is not an
  event, so access = admin, or holding ops.view on ANY of its child events (the same rule
  the ops APIs apply). Document previews are still checked per event by the viewer.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { resolveScope, hasScopePermission } from '@/app/lib/ops/scope'

export default async function UmbrellaOperationsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id } = await params

  const scope = await resolveScope({ umbrellaId: id })
  const ok = !!session.adm || (!!scope && (await hasScopePermission({ sid: session.sid }, scope, 'ops.view')))
  if (!ok) redirect('/no-access?tool=operations')

  return <>{children}</>
}
