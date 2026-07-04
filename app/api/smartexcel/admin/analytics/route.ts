// GET /api/smartexcel/admin/analytics — ported from getWorkspaceAnalytics
import { NextResponse } from "next/server";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { RETENTION_DAYS } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { MODELS } from "@/app/lib/smartexcel/lib/ai";

export async function GET() {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.AUDIT_VIEW);
    const ws = user.workspaceId;

    const empty = {
      jobsByStatus: {} as Record<string, number>,
      totalJobs: 0,
      completed: 0,
      failed: 0,
      successRate: null as number | null,
      deletedJobs: 0,
      recipesByStatus: {} as Record<string, number>,
      models: MODELS,
      retentionDays: RETENTION_DAYS,
    };
    if (!ws) return NextResponse.json(empty);

    const db = getDb();
    const jobRows = await db
      .select({ status: schema.jobs.status, n: count() })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.workspaceId, ws), isNull(schema.jobs.deletedAt)))
      .groupBy(schema.jobs.status);
    const [deleted] = await db
      .select({ n: count() })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.workspaceId, ws), isNotNull(schema.jobs.deletedAt)));
    const recipeRows = await db
      .select({ status: schema.recipes.status, n: count() })
      .from(schema.recipes)
      .where(eq(schema.recipes.workspaceId, ws))
      .groupBy(schema.recipes.status);

    const jobsByStatus = Object.fromEntries(jobRows.map((r) => [r.status, r.n]));
    const totalJobs = jobRows.reduce((sum, r) => sum + r.n, 0);
    const completed = jobsByStatus["completed"] ?? 0;
    const failed = jobsByStatus["failed"] ?? 0;
    const finished = completed + failed;

    return NextResponse.json({
      jobsByStatus,
      totalJobs,
      completed,
      failed,
      successRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
      deletedJobs: deleted?.n ?? 0,
      recipesByStatus: Object.fromEntries(recipeRows.map((r) => [r.status, r.n])),
      models: MODELS,
      retentionDays: RETENTION_DAYS,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 403 });
  }
}
