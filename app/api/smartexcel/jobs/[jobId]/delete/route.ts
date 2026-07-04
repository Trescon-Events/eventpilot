import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.JOBS_DELETE);
    const { jobId } = await params;
    const db = getDb();
    const job = await loadJobForUser(db, jobId, user);

    await db.update(schema.jobs).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "job.delete",
      entityType: "job",
      entityId: job.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
