// GET /api/smartexcel/admin/users — ported from listUsers
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";

export async function GET() {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.USERS_MANAGE);
    if (!user.workspaceId) return NextResponse.json({ users: [] });
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
    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 403 });
  }
}
