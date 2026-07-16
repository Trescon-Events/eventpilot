/*
  Knowledge Base access gate + persistent sidebar.

  Middleware lets any authenticated user reach /admin/toolkit/* (treated as a
  "tool route", same pattern as /admin/bespoke). This layout enforces the
  actual access rule server-side via the module registry:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.knowledge_base === true → allowed
    - Everyone else → redirected to /no-access before any page HTML renders

  KB was previously access: 'always' (open to every staff member) with no
  gate at all. Moved to tool_grant on 15 Jul 2026 per Madhu's request — see
  app/lib/registry/modules.tsx's 'kb' entry. Do not replace this with a
  client-side check (see app/admin/bespoke/layout.tsx for why).

  Also renders the module sidebar (part of the nav overhaul, same day) —
  "Manage"/"Settings" only show for KB admins, resolved here server-side via
  the same hasModuleAccess('kb','admin') check isKbAdmin() itself uses, so
  the nested manage/layout.tsx's own stricter gate stays the single source
  of truth for actually enforcing it — this just decides what to show.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'
import { isKbAdmin } from '@/app/lib/kb/intel-access'
import ModuleSidebar from '@/app/components/ModuleSidebar'

const ICONS = {
  browse: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
  manage: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
}

const MODULE_ICON = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>

export default async function KnowledgeBaseLayout({ children }: { children: React.ReactNode }) {
  const session = await requireModuleAccess('kb')
  const admin = await isKbAdmin(session.sid)

  const groups = [
    { label: 'Browse', items: [
      { label: 'Documents', href: '/admin/toolkit/knowledge-base', icon: ICONS.browse },
    ] },
    ...(admin ? [{ label: 'Admin', items: [
      { label: 'Manage', href: '/admin/toolkit/knowledge-base/manage', icon: ICONS.manage },
      { label: 'Settings', href: '/admin/toolkit/knowledge-base/settings', icon: ICONS.settings },
    ] }] : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ModuleSidebar moduleLabel="Knowledge Base" moduleIcon={MODULE_ICON} moduleColor="#0E7490" groups={groups} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
