/*
  Knowledge Base "Manage" console access gate.

  This route holds the admin-only KB functionality migrated out of the old
  admin/page.tsx tab (Documents/Ingest, BD Workspaces, Press Intelligence,
  Pending Gaps). It sits under app/admin/toolkit/knowledge-base/, so it
  already inherits the parent layout's requireModuleAccess('kb') gate (plain
  tool access — same bar as browsing the Knowledge Base at all). This layout
  adds the STRICTER kb-admin-tier check on top of that, since everything on
  this page is an admin action (publishing/rejecting docs, running the press
  intelligence pipeline, managing BD workspaces and gap resolution).
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

export default async function KnowledgeBaseManageLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const ok = await isKbAdmin(session.sid)
  if (!ok) redirect('/no-access?tool=knowledge_base')
  return <>{children}</>
}
