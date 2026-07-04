// GET /api/smartexcel/admin/deleted — ported from listDeletedJobs
import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { RETENTION_DAYS } from "@/app/lib/smartexcel/lib/jobs-helpers";

export async function GET() {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.JOBS_DELETE);
    if (!user.workspaceId) return NextResponse.json({ jobs: [], retentionDays: RETENTION_DAYS });
    const db = getDb();

    const rows = await db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        deletedAt: schema.jobs.deletedAt,
        createdBy: schema.jobs.createdBy,
      })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.workspaceId, user.workspaceId), isNotNull(schema.jobs.deletedAt)))
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
    return NextResponse.json({ jobs, retentionDays: RETENTION_DAYS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 403 });
  }
}
