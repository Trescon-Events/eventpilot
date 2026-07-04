import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { RETENTION_DAYS } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

const RESTORE_WINDOW_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.JOBS_DELETE);
    const { jobId } = await params;
    const db = getDb();
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (!job || job.workspaceId !== user.workspaceId) throw new Error("Job not found.");
    if (!job.deletedAt) throw new Error("Job is not deleted.");
    if (Date.now() - job.deletedAt.getTime() > RESTORE_WINDOW_MS) {
      throw new Error("This job is past its recovery window.");
    }

    await db.update(schema.jobs).set({ deletedAt: null, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "job.restore",
      entityType: "job",
      entityId: job.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
