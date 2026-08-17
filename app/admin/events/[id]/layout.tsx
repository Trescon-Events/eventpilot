/*
  Event workspace baseline access gate. Middleware treats the hub itself
  and the shared sub-pages (plan/execution/brief/details/announcements/
  messaging) as "tool routes" (authenticated-only); this layout enforces
  the real check server-side, before any page HTML renders.

  2026-08-17: these pages had no gate of their own before this — they fell
  through to middleware.ts's blanket "/admin/* requires session.adm" rule,
  so a non-admin staffer with a real event_access_assignments role could
  never reach even the workspace hub. Gated on hasAnyEventAccess (ANY role
  on this event), not a specific permission key, since the hub's only
  content is a tab bar + summary — narrower gating here would strand a
  staffer who holds e.g. only 'sae.stakeholders.view' unable to reach the
  page that links them to Stakeholders. The 4 tool-specific sub-layouts
  (website/brand/market-intel/stakeholders) nest inside this one and keep
  their own tighter, already-working checks unchanged.

  /access (RBAC assignment management) is deliberately NOT covered by this
  gate in practice — it's excluded from middleware's isToolRoute allowlist,
  so it's still blocked before Next.js ever renders this layout for a
  non-admin. See app/admin/events/[id]/access/page.tsx.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { hasAnyEventAccess } from '@/app/lib/access/event-access'

export default async function EventWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id: eventId } = await params

  const isPlatformAdmin = !!session.adm
  const ok = isPlatformAdmin || (await hasAnyEventAccess(session.sid, eventId))
  if (!ok) redirect('/no-access?tool=event-workspace')

  return <>{children}</>
}
