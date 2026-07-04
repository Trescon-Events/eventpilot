// POST /api/smartexcel/jobs/:jobId/sample — ported from plan.functions.ts (regeneratePlan + runSample)
import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema, type DB } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, type AuthUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser, addAiTokens, latestInputArtifact } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { inspectFile, validateOperations, enqueueJob } from "@/app/lib/smartexcel/lib/worker-dispatch";
import { buildPlan, type StructuredUnderstanding } from "@/app/lib/smartexcel/lib/ai";
import { assertTransition, type JobStatus } from "@/app/lib/smartexcel/lib/job-states";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

async function regeneratePlan(
  db: DB,
  jobId: string,
  user: AuthUser,
  extraFeedback: string[] = [],
): Promise<{ planId: string | null }> {
  const job = await loadJobForUser(db, jobId, user);
  if (!job.structuredUnderstanding) return { planId: null };

  const [latest] = await db
    .select()
    .from(schema.executionPlans)
    .where(eq(schema.executionPlans.jobId, job.id))
    .orderBy(desc(schema.executionPlans.version))
    .limit(1);

  const feedback: string[] = [];
  if (latest) {
    const notes = await db
      .select({ content: schema.jobMessages.content })
      .from(schema.jobMessages)
      .where(
        and(
          eq(schema.jobMessages.jobId, job.id),
          eq(schema.jobMessages.role, "user"),
          gt(schema.jobMessages.createdAt, latest.createdAt),
        ),
      )
      .orderBy(schema.jobMessages.createdAt);
    feedback.push(...notes.map((n) => n.content));
  }
  const [lastSample] = await db
    .select({ summary: schema.sampleRuns.summary, error: schema.sampleRuns.error })
    .from(schema.sampleRuns)
    .where(eq(schema.sampleRuns.jobId, job.id))
    .orderBy(desc(schema.sampleRuns.startedAt))
    .limit(1);
  if (lastSample?.summary && /Skipped|Disallowed|Syntax error|invalid pattern/i.test(lastSample.summary)) {
    feedback.push(
      `PREVIOUS SAMPLE RUN HAD FAILURES — fix them in this new plan. ` +
        `Don't repeat the same broken expression. The worker reported:\n${lastSample.summary}` +
        (lastSample.error ? `\nError: ${lastSample.error}` : ""),
    );
  }
  feedback.push(...extraFeedback);

  const artifact = await latestInputArtifact(db, job.id);
  const inspection = artifact ? await inspectFile(artifact.storageKey) : null;
  const columns = inspection?.headers ?? [];
  const sampleRows = inspection?.sampleRows ?? [];

  const { result: draft, tokens } = await buildPlan(
    job.structuredUnderstanding as StructuredUnderstanding,
    columns,
    feedback,
    sampleRows,
  );
  await addAiTokens(db, job.id, tokens);

  const planId = crypto.randomUUID();
  await db.insert(schema.executionPlans).values({
    id: planId,
    jobId: job.id,
    version: (latest?.version ?? 0) + 1,
    summary: draft.summary,
    steps: draft.steps,
    operations: draft.operations,
    expectedOutput: draft.expectedOutput,
    risks: draft.risks,
    status: "pending",
  });
  await db.update(schema.jobs).set({ currentPlanId: planId, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
  return { planId };
}

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    if (!job.structuredUnderstanding) {
      return NextResponse.json({ error: "Chat a bit more so I understand the job, then click Run sample." }, { status: 400 });
    }
    assertTransition(job.status as JobStatus, "sample_running");

    const artifact = await latestInputArtifact(db, job.id);
    if (!artifact) return NextResponse.json({ error: "No input file to run on." }, { status: 400 });

    let { planId } = await regeneratePlan(db, job.id, user);
    if (!planId) return NextResponse.json({ error: "Could not prepare an execution plan." }, { status: 400 });
    let [plan] = await db
      .select({ operations: schema.executionPlans.operations })
      .from(schema.executionPlans)
      .where(eq(schema.executionPlans.id, planId));

    const ops = (plan?.operations as unknown[]) ?? [];
    if (ops.length > 0) {
      const validation = await validateOperations(ops);
      if (!validation.ok && validation.issues.length > 0) {
        const errorFeedback = validation.issues
          .map(
            (i) =>
              `Operation #${i.index} (${i.description ?? i.op}) — sandbox rejected with: "${i.error}". ` +
              `Rewrite this step so it parses and runs in the sandbox.`,
          )
          .join("\n");
        const retry = await regeneratePlan(db, job.id, user, [
          `PRE-FLIGHT VALIDATION FAILED on the previous plan attempt. Fix these specific ` +
            `issues before emitting the next plan:\n${errorFeedback}`,
        ]);
        if (retry.planId) {
          planId = retry.planId;
          [plan] = await db
            .select({ operations: schema.executionPlans.operations })
            .from(schema.executionPlans)
            .where(eq(schema.executionPlans.id, planId));
        }
      }
    }

    await db
      .update(schema.executionPlans)
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
      .where(eq(schema.executionPlans.id, planId));
    await db.update(schema.jobs).set({ status: "sample_running", updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    await db.insert(schema.sampleRuns).values({ jobId: job.id, planId, status: "pending" });
    await enqueueJob({
      jobId: job.id,
      planId,
      stage: "sample",
      inputObjectKey: artifact.storageKey,
      operations: plan?.operations ?? [],
    });
    await db.insert(schema.jobMessages).values({ jobId: job.id, role: "system", content: "Running a sample on a small chunk…" });
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "run.sample",
      entityType: "job",
      entityId: job.id,
      details: { planId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
