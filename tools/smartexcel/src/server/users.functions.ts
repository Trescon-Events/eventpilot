// User listing for the admin panel. There is no invite flow — accounts are
// created lazily by ssoLogin (see auth.functions.ts) the first time someone
// opens SmartExcel from EventPilot's Toolkit; role comes from the SSO token,
// which EventPilot derives from tool_grants.smart_excel / smart_excel_admin.
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { ensurePermission } from "@/server/jobs.functions";
import { PERMISSIONS } from "@/lib/roles";

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  ensurePermission(user, PERMISSIONS.USERS_MANAGE);
  if (!user.workspaceId) return { users: [] };
  const db = getDb();
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      status: schema.users.status,
      isSuperAdmin: schema.users.isSuperAdmin,
      roleKey: schema.roles.key,
    })
    .from(schema.users)
    .leftJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.workspaceId, user.workspaceId));
  return { users };
});
