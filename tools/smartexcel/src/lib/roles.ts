// Role + permission model (PRD §4). Super Admin is permanent and non-revokable
// and bypasses permission checks entirely. Admin/Standard permissions are
// data-driven (role_permissions table) so they can be tuned from the admin panel.

export type RoleKey = "super_admin" | "admin" | "standard";

export const PERMISSIONS = {
  JOBS_CREATE: "jobs.create",
  JOBS_RUN: "jobs.run",
  JOBS_VIEW_ALL: "jobs.view_all",
  JOBS_DELETE: "jobs.delete",
  FILES_DOWNLOAD: "files.download",
  FILES_DELETE: "files.delete",
  RECIPES_CREATE: "recipes.create",
  RECIPES_APPLY: "recipes.apply",
  RECIPES_REVIEW: "recipes.review",
  RECIPES_PUBLISH: "recipes.publish",
  USERS_INVITE: "users.invite",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  WORKSPACE_MANAGE: "workspace.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  "jobs.create": "Create new jobs and upload files",
  "jobs.run": "Run jobs (sample and full runs)",
  "jobs.view_all": "View all workspace jobs and outputs",
  "jobs.delete": "Delete jobs (soft delete)",
  "files.download": "Download produced files",
  "files.delete": "Delete produced files",
  "recipes.create": "Flag a successful job as a recipe candidate",
  "recipes.apply": "Apply an approved recipe to a new file",
  "recipes.review": "Review candidate recipes",
  "recipes.publish": "Publish recipes for workspace reuse",
  "users.invite": "Invite new users",
  "users.manage": "Manage users and assign roles",
  "roles.manage": "Configure role permissions",
  "workspace.manage": "Manage workspace settings and visibility",
  "audit.view": "View the audit log",
};

// Default permissions seeded per role. Editable later for admin/standard only.
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<RoleKey, "super_admin">, PermissionKey[]> = {
  admin: [
    PERMISSIONS.JOBS_CREATE,
    PERMISSIONS.JOBS_RUN,
    PERMISSIONS.JOBS_VIEW_ALL,
    PERMISSIONS.JOBS_DELETE,
    PERMISSIONS.FILES_DOWNLOAD,
    PERMISSIONS.FILES_DELETE,
    PERMISSIONS.RECIPES_CREATE,
    PERMISSIONS.RECIPES_APPLY,
    PERMISSIONS.RECIPES_REVIEW,
    PERMISSIONS.RECIPES_PUBLISH,
    PERMISSIONS.USERS_INVITE,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.WORKSPACE_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
  standard: [
    PERMISSIONS.JOBS_CREATE,
    PERMISSIONS.JOBS_RUN,
    PERMISSIONS.JOBS_VIEW_ALL,
    PERMISSIONS.FILES_DOWNLOAD,
    PERMISSIONS.RECIPES_CREATE,
    PERMISSIONS.RECIPES_APPLY,
  ],
};

export const ROLE_DEFINITIONS: { key: RoleKey; name: string; description: string }[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Permanent platform owner with full, non-revokable access.",
  },
  { key: "admin", name: "Admin", description: "Operational management of the workspace." },
  { key: "standard", name: "Standard", description: "Create and run jobs; view allowed history." },
];

export interface PermissionContext {
  isSuperAdmin: boolean;
  permissions: Set<string>;
}

export function hasPermission(ctx: PermissionContext, permission: PermissionKey): boolean {
  if (ctx.isSuperAdmin) return true; // Super Admin bypasses all checks.
  return ctx.permissions.has(permission);
}
