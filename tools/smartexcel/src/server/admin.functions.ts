// Admin-only server functions powering the pre-deployment admin screens
// (PRD §6.10, §7.3): role-permission editor, audit-log view, deleted-job
// recovery. Each is permission-gated via the data-driven role model.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { ensurePermission, RETENTION_DAYS } from "@/server/jobs.functions";
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, type PermissionKey } from "@/lib/roles";
import { writeAudit } from "@/lib/audit";

const EDITABLE_ROLE_KEYS = ["admin", "standard"] as const;
type EditableRoleKey = (typeof EDITABLE_ROLE_KEYS)[number];
const PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

export const getRolePermissions = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  ensurePermission(user, PERMISSIONS.ROLES_MANAGE);
  const db = getDb();

  const roles = await db.select().from(schema.roles);
  const allRolePerms = await db
    .select({ roleId: schema.rolePermissions.roleId, key: schema.permissions.key })
    .from(schema.rolePermissions)
    .innerJoin(
      schema.permissions,
      eq(schema.rolePermissions.permissionId, schema.permissions.id),
    );

  const byRole: Record<string, PermissionKey[]> = {};
  for (const rp of allRolePerms) {
    (byRole[rp.roleId] ??= []).push(rp.key as PermissionKey);
  }

  const editable = roles
    .filter((r) => (EDITABLE_ROLE_KEYS as readonly string[]).includes(r.key))
    .map((r) => ({
      key: r.key as EditableRoleKey,
      name: r.name,
      permissions: byRole[r.id] ?? [],
    }));

  const catalog = PERMISSION_KEYS.map((k) => ({ key: k, description: PERMISSION_DESCRIPTIONS[k] }));
  return { roles: editable, catalog };
});

export const setRolePermissions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        roleKey: z.enum(EDITABLE_ROLE_KEYS),
        permissions: z.array(z.string()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.ROLES_MANAGE);
    const db = getDb();

    const valid = new Set<string>(PERMISSION_KEYS);
    const toAssign = data.permissions.filter((p) => valid.has(p));

    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, data.roleKey));
    if (!role) throw new Error("Role not found.");

    const perms = await db.select().from(schema.permissions);
    const idByKey = new Map(perms.map((p) => [p.key, p.id]));

    await db
      .delete(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, role.id));
    if (toAssign.length > 0) {
      await db
        .insert(schema.rolePermissions)
        .values(toAssign.map((p) => ({ roleId: role.id, permissionId: idByKey.get(p)! })));
    }

    await writeAudit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: "role.permissions.set",
      entityType: "role",
      entityId: role.id,
      details: { roleKey: data.roleKey, permissions: toAssign },
    });
    return { ok: true as const };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.AUDIT_VIEW);
    if (!user.workspaceId) return { entries: [] };
    const db = getDb();

    const rows = await db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        details: schema.auditLogs.details,
        createdAt: schema.auditLogs.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.actorUserId, schema.users.id))
      .where(eq(schema.auditLogs.workspaceId, user.workspaceId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(data.limit ?? 100);
    return { entries: rows };
  });

export const listDeletedJobs = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  ensurePermission(user, PERMISSIONS.JOBS_DELETE);
  if (!user.workspaceId) return { jobs: [], retentionDays: RETENTION_DAYS };
  const db = getDb();

  const rows = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      deletedAt: schema.jobs.deletedAt,
      createdBy: schema.jobs.createdBy,
    })
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.workspaceId, user.workspaceId), isNotNull(schema.jobs.deletedAt)),
    )
    .orderBy(desc(schema.jobs.deletedAt));

  const now = Date.now();
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const jobs = rows.map((r) => {
    const elapsed = r.deletedAt ? now - r.deletedAt.getTime() : 0;
    return {
      id: r.id,
      title: r.title,
      deletedAt: r.deletedAt,
      createdBy: r.createdBy,
      daysRemaining: Math.max(0, Math.ceil((retentionMs - elapsed) / (24 * 60 * 60 * 1000))),
      recoverable: elapsed <= retentionMs,
    };
  });
  return { jobs, retentionDays: RETENTION_DAYS };
});
