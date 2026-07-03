// Chat-driven flow: plan-as-data, not plan-as-gate.
//
// `regeneratePlan` is a non-server-fn helper called by `refineUnderstanding`
// after each chat turn so the "what will run" stays current. `runSample`
// commits the latest plan and dispatches the sample run — no separate plan
// approval step. Reject/rework collapse into "just keep chatting."
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { requireUser } from "@/lib/session";
import { addAiTokens, loadJobForUser, latestInputArtifact } from "@/server/jobs.functions";
import { inspectFile, validateOperations } from "@/lib/worker-dispatch";
import { buildPlan, type StructuredUnderstanding } from "@/lib/ai";
import { assertTransition, type JobStatus } from "@/lib/job-states";
import { enqueueJob } from "@/lib/queue";
import { writeAudit } from "@/lib/audit";
import type { AuthUser } from "@/types/auth";

const jobIdInput = z.object({ jobId: z.string().uuid() });

// Regenerate the plan / operations from the current understanding + recent
// user feedback. Called by `runSample` so each sample uses a fresh plan that
// reflects the latest chat. NOT called per-chat-turn (that doubled token spend
// for a plan the user never saw — they ack via chat, not via a plan panel).
export async function regeneratePlan(
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

  // Incorporate user feedback AND the last sample run's outcome (so the AI
  // sees its own failures: "Skipped custom step (...): Disallowed name: ...".
  // Without this the AI never learns that its code was rejected and keeps
  // emitting the same broken expression on every retry.
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

  // Real column names + sample rows so the AI can both reference real columns
  // and spot data-quality issues (mojibake, leading apostrophes, mixed casing,
  // etc.) without guessing.
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
  await db
    .update(schema.jobs)
    .set({ currentPlanId: planId, updatedAt: new Date() })
    .where(eq(schema.jobs.id, job.id));
  return { planId };
}

// Run a sample of the current plan. Allowed from clarifying / sample_pending /
// rework_requested / failed — i.e. any non-running state once an understanding
// + plan exist. If no plan yet, generate one first.
export const runSample = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => jobIdInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    if (!job.structuredUnderstanding) {
      throw new Error("Chat a bit more so I understand the job, then click Run sample.");
    }
    assertTransition(job.status as JobStatus, "sample_running");

    const artifact = await latestInputArtifact(db, job.id);
    if (!artifact) throw new Error("No input file to run on.");

    // Always regenerate the plan on each Run sample so the operations reflect
    // the latest chat turn. Cheaper than regenerating on every chat keystroke,
    // and the plan never goes to disk until it's about to run.
    let { planId } = await regeneratePlan(db, job.id, user);
    if (!planId) throw new Error("Could not prepare an execution plan.");
    let [plan] = await db
      .select({ operations: schema.executionPlans.operations })
      .from(schema.executionPlans)
      .where(eq(schema.executionPlans.id, planId));

    // Pre-flight: ask the worker to validate every custom_transform expression
    // in the same sandbox the real run will use. If anything fails, auto-regen
    // the plan once with the validation errors as explicit feedback. Saves a
    // full failed-sample cycle when the AI emits broken code.
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
    await db
      .update(schema.jobs)
      .set({ status: "sample_running", updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    await db.insert(schema.sampleRuns).values({
      jobId: job.id,
      planId,
      status: "pending",
    });
    await enqueueJob({
      jobId: job.id,
      planId,
      stage: "sample",
      inputObjectKey: artifact.storageKey,
      operations: plan?.operations ?? [],
    });
    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "system",
      content: "Running a sample on a small chunk…",
    });
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "run.sample",
      entityType: "job",
      entityId: job.id,
      details: { planId },
    });
    return { ok: true };
  });
