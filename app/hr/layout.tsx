import ModuleSidebar from '@/app/components/ModuleSidebar'
import { getServerSession } from '@/app/lib/registry/access'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/*
  HR's own access gate already lives in middleware.ts. This layout only adds
  the persistent sidebar UI, no additional access logic — mirrors
  app/finance/layout.tsx exactly.

  Covers all of app/hr/** including app/hr/staff/[id] and app/hr/staff/new —
  those are detail/sub-pages of "Staff Directory", not separate sidebar
  destinations, so the sidebar highlights "Staff Directory" while viewing
  them (isActive matches on the `/hr/staff` prefix). That's expected.

  "Settings" (the Toolkit-hub-visibility grant, module_access key 'hr') only
  shows for module-admin tier, same convention as
  app/admin/toolkit/knowledge-base/layout.tsx — this is just what's shown,
  not a gate; the real /hr gate stays entirely in middleware.ts.
*/

const ICONS = {
  overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  staff: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  recruitment: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  attendance: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  leave: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  onboarding: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  performance: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
}

const MODULE_ICON = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  const admin = session ? await hasModuleAccess(session.sid, 'hr', 'admin') : false

  const GROUPS = [
    { label: 'Overview', items: [
      { label: 'Overview', href: '/hr', icon: ICONS.overview },
    ] },
    { label: 'People', items: [
      { label: 'Staff Directory', href: '/hr/staff', icon: ICONS.staff },
      { label: 'Recruitment', href: '/hr/recruitment', icon: ICONS.recruitment },
    ] },
    { label: 'Time & Leave', items: [
      { label: 'Attendance', href: '/hr/attendance', icon: ICONS.attendance },
      { label: 'Leave Manager', href: '/hr/leave', icon: ICONS.leave },
    ] },
    { label: 'Lifecycle', items: [
      { label: 'Onboarding', href: '/hr/onboarding', icon: ICONS.onboarding },
      { label: 'Performance Reviews', href: '/hr/performance', icon: ICONS.performance },
    ] },
    ...(admin ? [{ label: 'Admin', items: [
      { label: 'Settings', href: '/hr/settings', icon: ICONS.settings },
    ] }] : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ModuleSidebar moduleLabel="HR Portal" moduleIcon={MODULE_ICON} moduleColor="#A172F2" groups={GROUPS} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
