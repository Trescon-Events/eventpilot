/*
  Task Manager Admin Console access gate.

  Distinct from the base module (open to everyone, kind: 'always') —
  this is a management/oversight view, gated separately so only team
  leads (e.g. Khalifa for branding) see it. Same middleware "tool route"
  entry (/admin/task-manager) covers this subpath too, no separate line needed.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function TaskManagerConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('task-manager-admin')
  return <>{children}</>
}
