// Auth bridge: replaces the old cross-origin SSO token flow (EventPilot ->
// HMAC token -> SmartExcel's own session cookie) now that SmartExcel is native
// Next.js code running inside EventPilot's own session. Every call reads
// EventPilot's own `tcs_session` cookie directly (same as
// app/api/toolkit-access/route.ts) and syncs/loads the matching SmartExcel
// `users` row by email — no separate login, no separate session table.
//
// Why this doesn't use the shared registry (app/lib/registry/access.ts
// checkAccess()/requireModuleAccess()) or the generic module_access table:
// SmartExcel predates that unification and layers its own workspace/role/
// permission model (schema.users/roles/permissions, ported from the
// standalone app) on top of the entry-gate check done here. Migrating it
// onto the generic module_access gate would only cover the front-door
// check — it wouldn't touch this per-request user sync or the internal
// RBAC (see app/smartexcel/admin/roles + PERMISSIONS in ./lib/roles), so
// there's no net simplification, just added risk. It stays bespoke on
// purpose; see also the comment in app/lib/access/tool-grants.ts.
//
// The entry gate itself (grants.smart_excel / grants.smart_excel_admin
// below) still reads the *same* staff_members.tool_grants JSONB column
// that the shared registry's hasToolGrant() reads — so the generic
// "Staff -> Access & Tools" toggle (app/admin/org-chart, app/hr/staff/new,
// /api/admin/tool-permissions) and the access-requests grant flow both
// correctly grant/revoke SmartExcel access. What SmartExcel's own
// admin/roles page controls is a separate, narrower concern: which
// *permissions* the already-granted "admin" vs "standard" role has inside
// SmartExcel — not who holds smart_excel/smart_excel_admin in the first
// place. Don't confuse the two when reasoning about access bugs here.
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema, type DB } from "./db/client";
import { supabaseAdmin } from "@/app/lib/supabase";
import { hasPermission, PERMISSIONS, type PermissionKey, type RoleKey } from "./lib/roles";

// Matches SmartExcel's own SUPER_ADMIN_EMAIL default (tools/smartexcel/src/lib/env.ts) —
// intentionally independent of EventPilot's own super-admin flag.
const SUPER_ADMIN_EMAIL = "md@tresconglobal.com";
const WORKSPACE_SLUG = "trescon";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  roleKey: RoleKey | null;
  isSuperAdmin: boolean;
  workspaceId: string | null;
  permissions: PermissionKey[];
}

interface EventPilotSession {
  sid: string;
  adm?: boolean;
}

async function readEventPilotSession(): Promise<EventPilotSession | null> {
  const raw = (await cookies()).get("tcs_session")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    return parsed?.sid ? parsed : null;
  } catch {
    return null;
  }
}

async function getRoleIdByKey(db: DB, key: RoleKey): Promise<string> {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, key));
  if (role) return role.id;
  const [created] = await db
    .insert(schema.roles)
    .values({ key, name: key, isSystem: true })
    .returning({ id: schema.roles.id });
  return created.id;
}

async function getDefaultWorkspaceId(db: DB): Promise<string> {
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, WORKSPACE_SLUG));
  if (ws) return ws.id;
  const [created] = await db
    .insert(schema.workspaces)
    .values({ name: "Trescon", slug: WORKSPACE_SLUG })
    .returning({ id: schema.workspaces.id });
  return created.id;
}

// Loads (and lazily upserts) the current user, mirroring what the old
// ssoLogin() did on every "Open SmartExcel" click — except now it runs
// per-request off EventPilot's live session/grants instead of a signed token
// minted once at launch time. Returns null if the caller isn't signed into
// EventPilot, or doesn't hold tool_grants.smart_excel / smart_excel_admin.
export async function getSmartExcelUser(): Promise<AuthUser | null> {
  const session = await readEventPilotSession();
  if (!session) return null;

  const { data: staff } = await supabaseAdmin
    .from("staff_members")
    .select("id, name, email, tool_grants")
    .eq("id", session.sid)
    .single();
  if (!staff?.email) return null;

  const grants = (staff.tool_grants ?? {}) as Record<string, boolean>;
  const isToolAdmin = session.adm === true || grants.smart_excel_admin === true;
  const hasAccess = session.adm === true || grants.smart_excel === true || isToolAdmin;
  if (!hasAccess) return null;

  const email = staff.email.toLowerCase().trim();
  const isSuper = email === SUPER_ADMIN_EMAIL;
  const roleKey: RoleKey = isSuper ? "super_admin" : isToolAdmin ? "admin" : "standard";

  const db = getDb();
  const [roleId, workspaceId] = await Promise.all([
    getRoleIdByKey(db, roleKey),
    getDefaultWorkspaceId(db),
  ]);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  let userId: string;
  if (!existing) {
    const [created] = await db
      .insert(schema.users)
      .values({
        email,
        name: staff.name ?? null,
        roleId,
        workspaceId,
        status: "active",
        isSuperAdmin: isSuper,
        lastLoginAt: new Date(),
      })
      .returning({ id: schema.users.id });
    userId = created.id;
  } else {
    userId = existing.id;
    // Only write when something actually changed (role/grant flip, name edit,
    // reactivation) — keeps the common case to reads only.
    const stale =
      existing.roleId !== roleId ||
      existing.isSuperAdmin !== isSuper ||
      existing.status !== "active" ||
      existing.name !== (staff.name ?? existing.name);
    if (stale) {
      await db
        .update(schema.users)
        .set({
          name: staff.name ?? existing.name,
          roleId,
          isSuperAdmin: isSuper,
          workspaceId: existing.workspaceId ?? workspaceId,
          status: "active",
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, existing.id));
    }
  }

  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isSuperAdmin: schema.users.isSuperAdmin,
      workspaceId: schema.users.workspaceId,
      status: schema.users.status,
      roleId: schema.users.roleId,
      roleKeyCol: schema.roles.key,
    })
    .from(schema.users)
    .leftJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, userId));

  if (!row || row.status === "disabled") return null;

  let permissions: PermissionKey[] = [];
  if (row.roleId) {
    const perms = await db
      .select({ key: schema.permissions.key })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, row.roleId));
    permissions = perms.map((p) => p.key as PermissionKey);
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleKey: (row.roleKeyCol as RoleKey | null) ?? null,
    isSuperAdmin: row.isSuperAdmin,
    workspaceId: row.workspaceId,
    permissions,
  };
}

export function userCan(user: AuthUser, permission: PermissionKey): boolean {
  return hasPermission(
    { isSuperAdmin: user.isSuperAdmin, permissions: new Set<string>(user.permissions) },
    permission,
  );
}

export function ensurePermission(user: AuthUser, permission: PermissionKey) {
  if (!userCan(user, permission)) {
    throw new Error("You don't have permission to do that.");
  }
}

export { PERMISSIONS };
