// Idempotent seed: default workspace, system roles, permission catalog, role
// permission defaults, and the permanent Super Admin (md@tresconglobal.com).
// There is no password to seed — accounts (including Super Admin) sign in
// exclusively via EventPilot's SSO bridge (see /sso + ssoLogin).
//
// Run with creds available, e.g.:
//   DATABASE_URL=... npm run db:seed
// (a local .env is auto-loaded if present)

import { eq } from "drizzle-orm";
import { getDb } from "./index";
import {
  permissions as permissionsTable,
  rolePermissions,
  roles as rolesTable,
  users,
  workspaces,
} from "./schema";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFINITIONS,
  type PermissionKey,
  type RoleKey,
} from "@/lib/roles";
import { getConfig } from "@/lib/env";

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — rely on the ambient environment
  }

  const db = getDb();
  const cfg = getConfig();

  // 1. Default workspace
  let [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, "trescon"));
  if (!workspace) {
    [workspace] = await db
      .insert(workspaces)
      .values({ name: "Trescon", slug: "trescon" })
      .returning();
    console.log("Created workspace: Trescon");
  }

  // 2. Permission catalog
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await db
      .insert(permissionsTable)
      .values({ key, description })
      .onConflictDoNothing({ target: permissionsTable.key });
  }

  // 3. System roles
  for (const def of ROLE_DEFINITIONS) {
    await db
      .insert(rolesTable)
      .values({ key: def.key, name: def.name, description: def.description, isSystem: true })
      .onConflictDoNothing({ target: rolesTable.key });
  }
  const roleRows = await db.select().from(rolesTable);
  const roleByKey = new Map<RoleKey, string>(roleRows.map((r) => [r.key, r.id]));
  const permRows = await db.select().from(permissionsTable);
  const permByKey = new Map(permRows.map((p) => [p.key, p.id]));

  // 4. Default role permissions (admin + standard; super_admin bypasses checks)
  for (const roleKey of ["admin", "standard"] as const) {
    const roleId = roleByKey.get(roleKey)!;
    for (const perm of DEFAULT_ROLE_PERMISSIONS[roleKey] as PermissionKey[]) {
      const permissionId = permByKey.get(perm);
      if (!permissionId) continue;
      await db
        .insert(rolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing();
    }
  }

  // 5. Permanent Super Admin — row is optional; ssoLogin creates/updates it
  // automatically the first time cfg.SUPER_ADMIN_EMAIL signs in via EventPilot.
  // Seeding it here just means the Admin panel shows them from day one.
  const superAdminRoleId = roleByKey.get("super_admin")!;

  const [existing] = await db.select().from(users).where(eq(users.email, cfg.SUPER_ADMIN_EMAIL));
  if (existing) {
    await db
      .update(users)
      .set({
        isSuperAdmin: true,
        status: "active",
        roleId: superAdminRoleId,
        workspaceId: existing.workspaceId ?? workspace.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`Ensured Super Admin: ${cfg.SUPER_ADMIN_EMAIL}`);
  } else {
    await db.insert(users).values({
      email: cfg.SUPER_ADMIN_EMAIL,
      name: "Super Admin",
      roleId: superAdminRoleId,
      workspaceId: workspace.id,
      status: "active",
      isSuperAdmin: true,
    });
    console.log(`Created Super Admin: ${cfg.SUPER_ADMIN_EMAIL}`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
