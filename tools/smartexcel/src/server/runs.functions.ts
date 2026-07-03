// Chat-driven flow: a single explicit "Run full job" gate. Rework is implicit
// — the user just keeps chatting and clicks Run sample again.
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { loadJobForUser, latestInputArtifact } from "@/server/jobs.functions";
import { assertTransition, type JobStatus } from "@/lib/job-states";
import { enqueueJob } from "@/lib/queue";
import { writeAudit } from "@/lib/audit";

export const runFull = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    if (!job.currentPlanId) throw new Error("No approved plan to run.");
    assertTransition(job.status as JobStatus, "full_running");

    const artifact = await latestInputArtifact(db, job.id);
    if (!artifact) throw new Error("No input file to process.");
    const [plan] = await db
      .select({ operations: schema.executionPlans.operations })
      .from(schema.executionPlans)
      .where(eq(schema.executionPlans.id, job.currentPlanId));

    await db
      .update(schema.jobs)
      .set({ status: "full_running", updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    await db
      .insert(schema.fullRuns)
      .values({ jobId: job.id, planId: job.currentPlanId, status: "pending", progress: 0 });
    await enqueueJob({
      jobId: job.id,
      planId: job.currentPlanId,
      stage: "full",
      inputObjectKey: artifact.storageKey,
      operations: plan?.operations ?? [],
    });
    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "system",
      content: "Running the full job…",
    });
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "run.full",
      entityType: "job",
      entityId: job.id,
    });
    return { ok: true };
  });
