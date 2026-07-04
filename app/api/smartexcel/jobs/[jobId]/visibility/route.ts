import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

const bodySchema = z.object({ visibility: z.enum(["workspace", "restricted"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const { visibility } = bodySchema.parse(await req.json());
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    if (job.createdBy !== user.id) ensurePermission(user, PERMISSIONS.WORKSPACE_MANAGE);

    await db.update(schema.jobs).set({ visibility, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "job.visibility",
      entityType: "job",
      entityId: job.id,
      details: { visibility },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
