import { getServerSession } from '@/app/lib/registry/access'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import DataLayoutClient from './layout-client'

/*
  Smart Data's own access gate lives in middleware.ts (`/data/*`), untouched
  here. This server layout only resolves whether the current user is
  'data-extract' module-admin tier — same convention as
  app/admin/toolkit/knowledge-base/layout.tsx's isKbAdmin() check — and
  passes it down to the client sidebar (app/data/layout-client.tsx, which
  needs 'use client' for its credits-meter state) purely to decide whether
  the "Settings" nav item renders. Not a gate, just what's shown.
*/
export default async function DataLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  const isAdmin = session ? await hasModuleAccess(session.sid, 'data-extract', 'admin') : false

  return <DataLayoutClient isAdmin={isAdmin}>{children}</DataLayoutClient>
}
