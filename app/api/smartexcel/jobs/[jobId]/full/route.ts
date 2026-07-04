// POST /api/smartexcel/jobs/:jobId/full — ported from runFull
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser, latestInputArtifact } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { enqueueJob } from "@/app/lib/smartexcel/lib/worker-dispatch";
import { assertTransition, type JobStatus } from "@/app/lib/smartexcel/lib/job-states";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    if (!job.currentPlanId) return NextResponse.json({ error: "No approved plan to run." }, { status: 400 });
    assertTransition(job.status as JobStatus, "full_running");

    const artifact = await latestInputArtifact(db, job.id);
    if (!artifact) return NextResponse.json({ error: "No input file to process." }, { status: 400 });
    const [plan] = await db
      .select({ operations: schema.executionPlans.operations })
      .from(schema.executionPlans)
      .where(eq(schema.executionPlans.id, job.currentPlanId));

    await db.update(schema.jobs).set({ status: "full_running", updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    await db.insert(schema.fullRuns).values({ jobId: job.id, planId: job.currentPlanId, status: "pending", progress: 0 });
    await enqueueJob({
      jobId: job.id,
      planId: job.currentPlanId,
      stage: "full",
      inputObjectKey: artifact.storageKey,
      operations: plan?.operations ?? [],
    });
    await db.insert(schema.jobMessages).values({ jobId: job.id, role: "system", content: "Running the full job…" });
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "run.full",
      entityType: "job",
      entityId: job.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
