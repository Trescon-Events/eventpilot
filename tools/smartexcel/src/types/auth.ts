import type { PermissionKey, RoleKey } from "@/lib/roles";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  roleKey: RoleKey | null;
  isSuperAdmin: boolean;
  workspaceId: string | null;
  permissions: PermissionKey[];
}
