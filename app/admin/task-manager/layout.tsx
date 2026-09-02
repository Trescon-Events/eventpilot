/*
  Task Manager access gate.

  Middleware lets any authenticated user reach /admin/task-manager/* (treated
  as a "tool route", same pattern as /admin/bespoke). This layout enforces
  the actual access rule server-side via the module registry:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.task_manager === true → allowed
    - Everyone else → redirected to /no-access before any page HTML renders
*/

import { requireModuleAccess } from '@/app/lib/registry/access'
import NotificationManager from './NotificationManager'

export default async function TaskManagerLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('task-manager')
  return (
    <>
      {children}
      <NotificationManager />
    </>
  )
}
