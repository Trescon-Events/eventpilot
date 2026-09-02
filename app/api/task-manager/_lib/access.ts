import { hasModuleAccess } from '@/app/lib/access/module-access'
import { hasToolGrant } from '@/app/lib/access/tool-grants'

// Every task-manager API route's session auth funnels through here.
// Internal staff: unchanged, any authenticated session may use the module
// (task-manager is 'always' access — see app/lib/registry/modules.tsx).
// Vendor accounts (staff_members.account_type = 'vendor', see
// supabase/vendor_accounts.sql): deny-by-default, same module_access grant
// the page layout itself requires via checkAccess() in
// app/lib/registry/access.ts — without this, a vendor account with no
// task-manager grant could still hit these API routes directly even though
// the UI hides the module from them.
export async function canAccessTaskManager(session: { sid: string; vt?: boolean } | null): Promise<boolean> {
  if (!session) return false
  if (!session.vt) return true
  return hasModuleAccess(session.sid, 'task-manager', 'user')
}

// Mirrors the 'task-manager-admin' registry entry's own tool_grant check
// (app/lib/registry/modules.tsx) — admin, the task_manager_admin grant, or
// the module's own Settings→Access tier are all sufficient. Used by the
// vendor-contacts roster API, which is Khalifa's Admin Console territory,
// not the base module.
export async function canAccessTaskManagerAdmin(session: { sid: string; adm?: boolean } | null): Promise<boolean> {
  if (!session) return false
  if (session.adm) return true
  if (await hasToolGrant(session.sid, 'task_manager_admin')) return true
  return hasModuleAccess(session.sid, 'task-manager-admin', 'user')
}
