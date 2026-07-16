/*
  DocuHub access gate + persistent sidebar.

  Middleware lets any authenticated user reach /admin/toolkit/* (treated as a
  "tool route", same pattern as /admin/bespoke). This layout enforces the
  actual access rule server-side via the module registry:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.docuhub === true → allowed
    - Everyone else → redirected to /no-access before any page HTML renders

  DocuHub was previously access: 'always' (open to every staff member) with
  no gate at all. Moved to tool_grant on 15 Jul 2026 per Madhu's request —
  see app/lib/registry/modules.tsx's 'docuhub' entry. Do not replace this
  with a client-side check (see app/admin/bespoke/layout.tsx for why).

  Also renders the module sidebar (part of the nav overhaul, same day) —
  "Settings" only shows for DocuHub admins, resolved here server-side via
  module_access (module_key 'dochub', NOT 'docuhub' — a pre-existing DB
  naming quirk, see supabase/docuhub_migration.sql). The actual settings
  page/API routes remain the real enforcement; this just decides what to
  show in the sidebar.

  Note: DocuHub's public permanent-link resolver (docuhub.tresconglobal.com,
  docs.tresconevents.com — rewritten by middleware.ts to
  /api/docuhub/resolve/...) is a separate API route unaffected by this
  layout — it operates purely on the hostname rewrite, not this page tree.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import ModuleSidebar from '@/app/components/ModuleSidebar'

const ICONS = {
  browse: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  upload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  bulk: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41 12 22l-8.59-8.59A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.41.59l8 8a2 2 0 0 1 0 2.82z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
}

const MODULE_ICON = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>

export default async function DocuHubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireModuleAccess('docuhub')
  const admin = session.adm || await hasModuleAccess(session.sid, 'dochub', 'admin')

  const groups = [
    { label: 'Browse', items: [
      { label: 'Documents', href: '/admin/toolkit/docuhub', icon: ICONS.browse },
    ] },
    { label: 'Manage', items: [
      { label: 'Upload', href: '/admin/toolkit/docuhub/upload', icon: ICONS.upload },
      { label: 'Bulk Upload', href: '/admin/toolkit/docuhub/bulk', icon: ICONS.bulk },
    ] },
    ...(admin ? [{ label: 'Admin', items: [
      { label: 'Settings', href: '/admin/toolkit/docuhub/settings', icon: ICONS.settings },
    ] }] : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ModuleSidebar moduleLabel="DocuHub" moduleIcon={MODULE_ICON} moduleColor="#D97706" groups={groups} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
