/*
  Umbrella workspace shell: the side navigation + the umbrella's real name for the breadcrumb.
  Each person sees only the parts of the umbrella they can use — an Operations user gets
  Operations only; a platform admin also gets Event Details, Reference Documents, the child events and Access. Access is admin, or ops.view on any
  child event (the same rule the Operations APIs apply). The pages and APIs keep their own checks;
  this decides what is SHOWN and refuses everyone else.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { resolveScope, hasScopePermission } from '@/app/lib/ops/scope'
import { hasAnySectionAssignmentForUmbrella } from '@/app/lib/ops/section-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import UmbrellaShell from './UmbrellaShell'

export default async function UmbrellaWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id } = await params

  const scope = await resolveScope({ umbrellaId: id })
  if (!scope) redirect('/no-access?tool=operations')
  const isAdmin = !!session.adm
  // ops.view on any child, or being assigned to an Operations section (Ops > Access) — matches the Operations layout.
  const canOps = isAdmin || (await hasScopePermission({ sid: session.sid }, scope, 'ops.view')) || (await hasAnySectionAssignmentForUmbrella(session.sid, id, scope.eventIds))
  if (!isAdmin && !canOps) redirect('/no-access?tool=operations')

  // Child events appear in the nav for admins only (each opens its own workspace, which applies its own gate).
  const events = isAdmin ? ((await supabaseAdmin.from('events').select('id, name').eq('umbrella_id', id).order('name')).data ?? []) : []
  return <UmbrellaShell umbrellaId={id} name={scope.name} isAdmin={isAdmin} canOps={canOps} events={events}>{children}</UmbrellaShell>
}
