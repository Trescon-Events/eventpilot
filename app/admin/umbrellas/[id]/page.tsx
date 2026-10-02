import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { resolveScope, hasScopePermission } from '@/app/lib/ops/scope'
import { hasAnySectionAssignmentForUmbrella } from '@/app/lib/ops/section-access'
import UmbrellaOverview from './UmbrellaOverview'

/* The umbrella hub. Middleware lets any signed-in person reach this URL, and the layout has already refused anyone with no
   access at all; here we decide which module tiles to show — an Operations user sees only Operations, a platform admin sees all. */
export default async function UmbrellaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id } = await params
  const scope = await resolveScope({ umbrellaId: id })
  if (!scope) redirect('/no-access?tool=operations')
  const isAdmin = !!session.adm
  const canOps = isAdmin || (await hasScopePermission({ sid: session.sid }, scope, 'ops.view')) || (await hasAnySectionAssignmentForUmbrella(session.sid, id, scope.eventIds))
  return <UmbrellaOverview umbrellaId={id} isAdmin={isAdmin} canOps={canOps} />
}
