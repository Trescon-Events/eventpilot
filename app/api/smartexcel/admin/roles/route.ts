// GET/POST /api/smartexcel/admin/roles — ported from getRolePermissions/setRolePermissions
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { PERMISSION_DESCRIPTIONS, type PermissionKey } from "@/app/lib/smartexcel/lib/roles";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

const EDITABLE_ROLE_KEYS = ["admin", "standard"] as const;
type EditableRoleKey = (typeof EDITABLE_ROLE_KEYS)[number];
const PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

export async function GET() {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.ROLES_MANAGE);
    const db = getDb();

    const roles = await db.select().from(schema.roles);
    const allRolePerms = await db
      .select({ roleId: schema.rolePermissions.roleId, key: schema.permissions.key })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id));

    const byRole: Record<string, PermissionKey[]> = {};
    for (const rp of allRolePerms) {
      (byRole[rp.roleId] ??= []).push(rp.key as PermissionKey);
    }

    const editable = roles
      .filter((r) => (EDITABLE_ROLE_KEYS as readonly string[]).includes(r.key))
      .map((r) => ({ key: r.key as EditableRoleKey, name: r.name, permissions: byRole[r.id] ?? [] }));

    const catalog = PERMISSION_KEYS.map((k) => ({ key: k, description: PERMISSION_DESCRIPTIONS[k] }));
    return NextResponse.json({ roles: editable, catalog });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 403 });
  }
}

const bodySchema = z.object({ roleKey: z.enum(EDITABLE_ROLE_KEYS), permissions: z.array(z.string()) });

export async function POST(req: NextRequest) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.ROLES_MANAGE);
    const data = bodySchema.parse(await req.json());
    const db = getDb();

    const valid = new Set<string>(PERMISSION_KEYS);
    const toAssign = data.permissions.filter((p) => valid.has(p));

    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, data.roleKey));
    if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });

    const perms = await db.select().from(schema.permissions);
    const idByKey = new Map(perms.map((p) => [p.key, p.id]));

    await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, role.id));
    if (toAssign.length > 0) {
      await db.insert(schema.rolePermissions).values(toAssign.map((p) => ({ roleId: role.id, permissionId: idByKey.get(p)! })));
    }

    await writeAudit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: "role.permissions.set",
      entityType: "role",
      entityId: role.id,
      details: { roleKey: data.roleKey, permissions: toAssign },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
