// GET /api/smartexcel/admin/audit?limit=200 — ported from listAuditLog
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";

export async function GET(req: NextRequest) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.AUDIT_VIEW);
    if (!user.workspaceId) return NextResponse.json({ entries: [] });
    const db = getDb();
    const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));

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
      .limit(limit);
    return NextResponse.json({ entries: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 403 });
  }
}
