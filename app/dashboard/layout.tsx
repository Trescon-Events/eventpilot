/*
  Dashboard access gate.

  Unlike /admin/task-manager (which calls requireModuleAccess and is
  deny-by-default for vendor sessions), this route had no server-side gate
  at all — any authenticated session could load the full My Dashboard
  (AI Readiness score, My Learning, My Events, My HR, Messages tiles)
  regardless of account_type. Vendor accounts (session.vt, see
  supabase/vendor_accounts.sql) are restricted-access agency logins and
  should only ever land on the module(s) explicitly granted to them
  (e.g. Task Manager for Pixelate/Cactus) — send them straight there
  instead of rendering any part of this page.
*/

import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (session?.vt) redirect('/admin/task-manager')
  return <>{children}</>
}
