/*
  Umbrella workspace shell: the side navigation + the umbrella's real name for the breadcrumb.
  Each person sees only the parts of the umbrella they can use — an Operations user gets
  Operations only; a platform admin also gets the Overview. Access is admin, or ops.view on any
  child event (the same rule the Operations APIs apply). The pages and APIs keep their own checks;
  this decides what is SHOWN and refuses everyone else.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { resolveScope, hasScopePermission } from '@/app/lib/ops/scope'
import UmbrellaShell from './UmbrellaShell'

export default async function UmbrellaWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id } = await params

  const scope = await resolveScope({ umbrellaId: id })
  if (!scope) redirect('/no-access?tool=operations')
  const isAdmin = !!session.adm
  const canOps = isAdmin || (await hasScopePermission({ sid: session.sid }, scope, 'ops.view'))
  if (!isAdmin && !canOps) redirect('/no-access?tool=operations')

  return <UmbrellaShell umbrellaId={id} name={scope.name} isAdmin={isAdmin} canOps={canOps}>{children}</UmbrellaShell>
}
