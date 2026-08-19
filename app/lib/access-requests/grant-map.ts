/**
 * Tool-key → grant-strategy mapping used by the access-requests dashboard.
 *
 * Different tools live behind different access mechanisms:
 *   - Most toolkit tools use `staff_members.tool_grants.{key}` (JSONB)
 *   - `/finance/*` `/hr/*` guards read `staff_members.access_roles` (text[])
 *     via the session cookie
 *   - `/admin/*` (non-tool) requires super_admin — deliberately manual so
 *     nobody grants admin access with one click by accident
 *
 * `grantKey` — key to set on staff_members.tool_grants
 * `role`     — value to add to staff_members.access_roles (session cookie)
 * `manual`   — dashboard shows a warning, admin must confirm explicitly;
 *              no auto-grant is applied
 */

export type GrantStrategy = {
  label:    string      // human label used in emails + UI
  grantKey?: string     // tool_grants JSONB key
  role?:     string     // access_roles text[] value
  manual?:   boolean    // true = require explicit confirm, don't auto-apply
}

export const GRANT_STRATEGY: Record<string, GrantStrategy> = {
  bespoke:             { label: 'Bespoke Tracker',     grantKey: 'bespoke' },
  task_manager_admin:  { label: 'Task Manager — Admin Console', grantKey: 'task_manager_admin' },
  website_builder:     { label: 'Website Builder',     grantKey: 'website_builder' },
  brand_studio:        { label: 'Brand Studio',        grantKey: 'brand_studio' },
  intelligence:        { label: 'Market Intelligence', grantKey: 'intelligence' },
  smart_data:          { label: 'Smart Data',          grantKey: 'smart_data' },
  smart_excel:         { label: 'Smart Excel',         grantKey: 'smart_excel' },
  corporate_marketing: { label: 'Corporate Marketing', grantKey: 'corporate_marketing' },
  finance:             { label: 'Finance Portal',      grantKey: 'finance',   role: 'finance' },
  hr:                  { label: 'HR Portal',           grantKey: 'hr_portal', role: 'hr' },
  admin:               { label: 'Admin Panel',         manual: true },
}

export function labelFor(toolKey: string): string {
  return GRANT_STRATEGY[toolKey]?.label ?? toolKey
}
