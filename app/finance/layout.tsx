import ModuleSidebar from '@/app/components/ModuleSidebar'
import { getServerSession } from '@/app/lib/registry/access'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/*
  Finance's own access gate already lives in middleware.ts (`/finance/*` →
  admin OR explicit 'finance' access_role — see the policy comment there,
  "department membership is NOT sufficient"). This layout only adds the
  persistent sidebar UI, no additional access logic.

  "Settings" (the Toolkit-hub-visibility grant, module_access key 'finance')
  only shows for module-admin tier, same convention as
  app/admin/toolkit/knowledge-base/layout.tsx — this is just what's shown,
  not a gate; the real /finance gate stays entirely in middleware.ts.
*/

const ICONS = {
  overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  salary: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  expenses: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  vendors: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  payroll: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
}

const MODULE_ICON = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  const admin = session ? await hasModuleAccess(session.sid, 'finance', 'admin') : false

  const GROUPS = [
    { label: 'Overview', items: [
      { label: 'Overview', href: '/finance', icon: ICONS.overview },
    ] },
    { label: 'Manage', items: [
      { label: 'Salary & Compensation', href: '/finance/salary', icon: ICONS.salary },
      { label: 'Expense Claims', href: '/finance/expenses', icon: ICONS.expenses },
      { label: 'Vendor Payments', href: '/finance/vendors', icon: ICONS.vendors },
    ] },
    { label: 'Reports', items: [
      { label: 'Payroll Summary', href: '/finance/payroll', icon: ICONS.payroll },
    ] },
    ...(admin ? [{ label: 'Admin', items: [
      { label: 'Settings', href: '/finance/settings', icon: ICONS.settings },
    ] }] : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ModuleSidebar moduleLabel="Finance Portal" moduleIcon={MODULE_ICON} moduleColor="#3D8EEA" groups={GROUPS} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
